package model

import "go.uber.org/zap"

type BackendConfig struct {
	Name              string            `json:"name"`
	BaseURL           string            `json:"base_url"`
	Prefix            string            `json:"prefix"`
	Default           bool              `json:"default"`
	RequireAPIKey     bool              `json:"require_api_key"`
	APIKey            string            `json:"api_key,omitempty"`  // Plaintext API key in config
	KeyEnvVar         string            `json:"key_env_var"`        // Legacy single key support
	APIKeys           []string          `json:"api_keys,omitempty"` // Multi-key support
	RoleRewrites      map[string]string `json:"role_rewrites,omitempty"`
	UnsupportedParams []string          `json:"unsupported_params,omitempty"`
}

// Config is the structure for the proxy configuration
type Config struct {
	ListeningPort      int               `json:"listening_port"`
	Logger             *zap.Logger       `json:"-"` // Exclude from JSON
	Backends           []BackendConfig   `json:"backends"`
	LLMRouterAPIKeyEnv string            `json:"llmrouter_api_key_env,omitempty"`
	LLMRouterAPIKey    string            `json:"llmrouter_api_key,omitempty"` // Plaintext router API key
	UseGeneratedKey    bool              `json:"-"`                           // Exclude from JSON
	Aliases            map[string]string `json:"aliases,omitempty"`
	ConfigFilePath     string            `json:"-"` // Path to config file, excluded from JSON
}

// ModelPricing represents pricing information for a model
type ModelPricing struct {
	Hourly   float64 `json:"hourly,omitempty"`
	Input    float64 `json:"input,omitempty"`
	Output   float64 `json:"output,omitempty"`
	Base     float64 `json:"base,omitempty"`
	Finetune float64 `json:"finetune,omitempty"`
}

// ModelConfig represents configuration details for a model
type ModelConfig struct {
	ChatTemplate    *string  `json:"chat_template,omitempty"`
	Stop            []string `json:"stop,omitempty"`
	BosToken        *string  `json:"bos_token,omitempty"`
	EosToken        *string  `json:"eos_token,omitempty"`
	MaxOutputLength *int     `json:"max_output_length,omitempty"`
}

// Model represents an OpenAI-compatible model object with extended metadata
type Model struct {
	// Standard OpenAI fields
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	OwnedBy string `json:"owned_by"`

	// Extended fields from providers
	Type          string        `json:"type,omitempty"`           // Model type: chat, audio, image, video, embedding, moderation, etc.
	DisplayName   string        `json:"display_name,omitempty"`   // Human-readable name
	Organization  string        `json:"organization,omitempty"`   // Organization that created the model
	Link          string        `json:"link,omitempty"`           // URL to model documentation
	License       string        `json:"license,omitempty"`        // Model license
	ContextLength int           `json:"context_length,omitempty"` // Maximum context window size
	Running       *bool         `json:"running,omitempty"`        // Whether the model is currently running
	Pricing       *ModelPricing `json:"pricing,omitempty"`        // Pricing information
	Config        *ModelConfig  `json:"config,omitempty"`         // Model configuration
}

// ModelsResponse represents the OpenAI-compatible models list response
type ModelsResponse struct {
	Object string  `json:"object"`
	Data   []Model `json:"data"`
}
