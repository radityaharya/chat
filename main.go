package main

import (
	"fmt"
	"log"
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
	configFile, llmRouterAPIKeyEnv, llmRouterAPIKey, listeningPort, logLevel := config.InitFlags()

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

	// If using a generated key, print a helpful message
	if cfg.UseGeneratedKey {
		fmt.Printf(`
Your LLM-Router endpoint will be exposed publicly so that Cursor's servers can invoke it.
A strong API key is highly recommended to prevent others from consuming your resources.

You may specify the API key via:
- Environment variable: export %s=your_api_key
- Command line flag: --llmrouter-api-key=your_api_key

Since neither of those have been set, we've generated a unique key for this session:
%s

This is what you should set as your API key in Cursor.
`, cfg.LLMRouterAPIKeyEnv, cfg.LLMRouterAPIKey)
	}

	// Log configured backends (using fmt.Printf so it always shows)
	fmt.Printf("\n=== Configured Backends (%d) ===\n", len(cfg.Backends))
	for i, backend := range cfg.Backends {
		fmt.Printf("  %d. %s\n", i+1, backend.Name)
		fmt.Printf("     URL: %s\n", backend.BaseURL)
		fmt.Printf("     Prefix: %s\n", backend.Prefix)
		fmt.Printf("     Requires API Key: %v\n", backend.RequireAPIKey)
		if backend.Default {
			fmt.Printf("     Default: true\n")
		}
		fmt.Println()
	}

	// Initialize proxies based on the loaded configuration
	proxy.InitializeProxies(cfg.Backends, logger)

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
	log.Printf("Starting server on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Failed to start server: %s", err)
	}
}
