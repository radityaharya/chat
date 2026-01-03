package model

import (
	"encoding/json"
	"strconv"

	"go.uber.org/zap"
)

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
	ConfigFilePath     string            `json:"-"`                          // Path to config file, excluded from JSON
	DatabaseURL        string            `json:"database_url"`               // Database URL for identity system
	ExaAPIKey          string            `json:"exa_api_key,omitempty"`      // Exa API key for search tool
	GeoapifyAPIKey     string            `json:"geoapify_api_key,omitempty"` // Geoapify API key for geo tool
}

// FlexibleFloat64 handles both string and float64 JSON values
type FlexibleFloat64 float64

func (f *FlexibleFloat64) UnmarshalJSON(b []byte) error {
	if len(b) >= 2 && b[0] == '"' && b[len(b)-1] == '"' {
		// It's a string, strip quotes and parse
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		if s == "" {
			*f = 0
			return nil
		}
		val, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return err
		}
		*f = FlexibleFloat64(val)
		return nil
	}
	// It's a number, unmarshal normally
	var val float64
	if err := json.Unmarshal(b, &val); err != nil {
		return err
	}
	*f = FlexibleFloat64(val)
	return nil
}

// ModelPricing represents pricing information for a model
type ModelPricing struct {
	Hourly     FlexibleFloat64 `json:"hourly,omitempty"`
	Input      FlexibleFloat64 `json:"input,omitempty"`
	Output     FlexibleFloat64 `json:"output,omitempty"`
	Base       FlexibleFloat64 `json:"base,omitempty"`
	Finetune   FlexibleFloat64 `json:"finetune,omitempty"`
	Prompt     FlexibleFloat64 `json:"prompt,omitempty"`     // OpenRouter field
	Completion FlexibleFloat64 `json:"completion,omitempty"` // OpenRouter field
	Request    FlexibleFloat64 `json:"request,omitempty"`    // OpenRouter field
	Image      FlexibleFloat64 `json:"image,omitempty"`      // OpenRouter field
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
	Name          string        `json:"name,omitempty"`           // Alias for DisplayName (OpenRouter)
	CanonicalSlug string        `json:"canonical_slug,omitempty"` // OpenRouter field
	Description   string        `json:"description,omitempty"`    // OpenRouter field
	Organization  string        `json:"organization,omitempty"`   // Organization that created the model
	Link          string        `json:"link,omitempty"`           // URL to model documentation
	License       string        `json:"license,omitempty"`        // Model license
	ContextLength int           `json:"context_length,omitempty"` // Maximum context window size
	Running       *bool         `json:"running,omitempty"`        // Whether the model is currently running
	Pricing       *ModelPricing `json:"pricing,omitempty"`        // Pricing information
	Config        *ModelConfig  `json:"config,omitempty"`         // Model configuration

	// OpenRouter specific nested structures
	Architecture        *map[string]interface{} `json:"architecture,omitempty"`
	TopProvider         *map[string]interface{} `json:"top_provider,omitempty"`
	SupportedParameters []string                `json:"supported_parameters,omitempty"`
}

// ModelsResponse represents the OpenAI-compatible models list response
type ModelsResponse struct {
	Object string  `json:"object"`
	Data   []Model `json:"data"`
}
