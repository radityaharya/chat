package identity

import (
	"encoding/json"
	"fmt"

	"go.uber.org/zap"
)

var globalAttachmentStore AttachmentStore
var globalLogger *zap.Logger

// SetGlobalAttachmentStore sets the global attachment store for use in history processing
func SetGlobalAttachmentStore(store AttachmentStore) {
	globalAttachmentStore = store
}

// SetGlobalLogger sets the global logger for use in history processing
func SetGlobalLogger(logger *zap.Logger) {
	globalLogger = logger
}

// processConversationImages processes a conversation's data to extract and save base64 images
func (am *AuthManager) processConversationImages(conv *ConversationHistory) error {
	if globalAttachmentStore == nil {
		return fmt.Errorf("attachment store not initialized")
	}

	// Parse the conversation data
	var data interface{}
	if err := json.Unmarshal(conv.Data, &data); err != nil {
		return fmt.Errorf("failed to unmarshal conversation data: %w", err)
	}

	// Process images in the data
	processedData, err := ExtractAndSaveImages(data, globalAttachmentStore)
	if err != nil {
		return fmt.Errorf("failed to process images: %w", err)
	}

	// Marshal back to JSON
	processedJSON, err := json.Marshal(processedData)
	if err != nil {
		return fmt.Errorf("failed to marshal processed data: %w", err)
	}

	// Update the conversation data
	conv.Data = json.RawMessage(processedJSON)
	return nil
}
