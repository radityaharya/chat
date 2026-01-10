package main

import (
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"llm-router/internal/config"
	"llm-router/internal/handler"
	"llm-router/internal/identity"
	"llm-router/internal/logging"
	"llm-router/internal/model"
	"llm-router/internal/proxy"

	"go.uber.org/zap"
)

func main() {
	// DefaultConfig is the default configuration in case the configuration file cannot be read.
	var defaultConfig = model.Config{
		ListeningPort: 11411,
		Backends: []model.BackendConfig{
			{
				Name:          "openai",
				BaseURL:       "https://api.openai.com",
				Prefix:        "openai/",
				Default:       true,
				RequireAPIKey: true,
			},
			{
				Name:    "ollama",
				BaseURL: "http://localhost:11434",
				Prefix:  "ollama/",
			},
		},
		LLMRouterAPIKeyEnv: "LLMROUTER_API_KEY",
		Aliases:            make(map[string]string),
	}

	// Initialize command-line flags
	configFile, llmRouterAPIKeyEnv, llmRouterAPIKey, listeningPort, logLevel, exaAPIKey, geoapifyAPIKey := config.InitFlags()

	// Initialize the logger
	logger, err := logging.NewLogger(logLevel)
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	// Load the configuration
	cfg, err := config.LoadConfig(configFile, llmRouterAPIKeyEnv, llmRouterAPIKey, listeningPort, defaultConfig, logger)
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	// Apply Exa API key override from command line if provided
	if exaAPIKey != "" {
		cfg.ExaAPIKey = exaAPIKey
		logger.Info("Exa API key override applied from command line")
	}

	// Apply Geoapify API key override from command line if provided
	if geoapifyAPIKey != "" {
		cfg.GeoapifyAPIKey = geoapifyAPIKey
		logger.Info("Geoapify API key override applied from command line")
	}

	// If using a generated key, log it through the logger
	if cfg.UseGeneratedKey {
		logger.Warn("Generating a unique API key for this session (none provided)",
			zap.String("api_key", cfg.LLMRouterAPIKey),
			zap.String("env_var", cfg.LLMRouterAPIKeyEnv))
	}

	// Log backend count
	logger.Info("Backends initialized", zap.Int("count", len(cfg.Backends)))

	// Initialize proxies based on the loaded configuration
	proxy.InitializeProxies(cfg.Backends, logger)

	// Initialize attachment store
	attachmentStore, err := identity.NewLocalFileStore("")
	if err != nil {
		logger.Fatal("Failed to initialize attachment store", zap.Error(err))
	}
	handler.SetAttachmentStore(attachmentStore)
	identity.SetGlobalAttachmentStore(attachmentStore)
	identity.SetGlobalLogger(logger)
	logger.Info("Attachment store initialized", zap.String("directory", "./data/attachments"))

	// Initialize identity system if database URL is provided
	var db identity.Database
	if cfg.DatabaseURL != "" {
		logger.Info("Initializing identity system with database")
		var err error
		db, err = identity.NewPostgresDB(cfg.DatabaseURL)
		if err != nil {
			logger.Fatal("Failed to initialize database", zap.Error(err))
		}

		authManager := identity.NewAuthManager(db)
		handler.SetAuthManager(authManager)
		logger.Info("Identity system initialized successfully")

		// Set up graceful shutdown for database
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		go func() {
			<-sigChan
			logger.Info("Shutting down gracefully...")
			if db != nil {
				db.Close()
			}
			os.Exit(0)
		}()
	} else {
		logger.Info("Identity system disabled (no DATABASE_URL provided)")
	}

	// Serve static files from web/dist (built frontend)
	// In development, run the Vite dev server separately
	webDir := "./web/dist"
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		webDir = "./web" // Fallback for development
	}

	// Set up unified HTTP handler
	fs := http.FileServer(http.Dir(webDir))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Check if this is an API request (e.g., /api/v1/..., /v1/..., /chat/completions, etc.)
		isAPIRequest := false
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			// Strip /api prefix and pass to handler
			r.URL.Path = r.URL.Path[4:]
			isAPIRequest = true
		} else if len(r.URL.Path) >= 3 && r.URL.Path[:3] == "/v1" {
			// Legacy /v1 prefix support
			isAPIRequest = true
		}

		if isAPIRequest {
			handler.HandleRequest(cfg, w, r)
			return
		}

		// For non-API requests, serve static files
		// Check if the file exists
		filePath := webDir + r.URL.Path
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			// File doesn't exist, serve index.html for SPA routing
			http.ServeFile(w, r, webDir+"/index.html")
			return
		}

		// File exists, serve it
		fs.ServeHTTP(w, r)
	})

	// Start the server
	addr := fmt.Sprintf(":%d", cfg.ListeningPort)
	logger.Info("Starting server", zap.String("address", addr))
	if err := http.ListenAndServe(addr, nil); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}
