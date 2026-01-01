package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"llm-router/internal/identity"
	"llm-router/internal/model"

	"go.uber.org/zap"
)

// HandleAttachment serves attachment files by UUID
func HandleAttachment(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	// Extract UUID from path
	uuid := strings.TrimPrefix(r.URL.Path, attachmentsPath)

	cfg.Logger.Info("HandleAttachment called",
		zap.String("path", r.URL.Path),
		zap.String("uuid", uuid),
		zap.String("attachmentsPath", attachmentsPath))

	if uuid == "" {
		http.Error(w, "attachment ID required", http.StatusBadRequest)
		return
	}

	// Check if attachment store is initialized
	if attachmentStore == nil {
		cfg.Logger.Error("Attachment store not initialized")
		http.Error(w, "attachment service unavailable", http.StatusServiceUnavailable)
		return
	}

	// Get attachment data
	data, contentType, err := attachmentStore.Get(uuid)
	if err != nil {
		cfg.Logger.Warn("Attachment not found",
			zap.String("uuid", uuid),
			zap.Error(err))
		http.Error(w, "attachment not found", http.StatusNotFound)
		return
	}

	// Set content type and serve the file
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000") // Cache for 1 year
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// HandleAttachmentUpload handles uploading new attachments
func HandleAttachmentUpload(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	// Check if attachment store is initialized
	if attachmentStore == nil {
		cfg.Logger.Error("Attachment store not initialized")
		http.Error(w, "attachment service unavailable", http.StatusServiceUnavailable)
		return
	}

	// Parse request body
	var req struct {
		Data        string `json:"data"`
		ContentType string `json:"contentType"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Decode base64 image
	data, contentType, err := identity.DecodeBase64Image(req.Data)
	if err != nil {
		cfg.Logger.Warn("Failed to decode image",
			zap.Error(err))
		http.Error(w, "invalid image data", http.StatusBadRequest)
		return
	}

	// Override content type if provided
	if req.ContentType != "" {
		contentType = req.ContentType
	}

	// Save to attachment store
	uuid, err := attachmentStore.Save(data, contentType)
	if err != nil {
		cfg.Logger.Error("Failed to save attachment",
			zap.Error(err))
		http.Error(w, "failed to save attachment", http.StatusInternalServerError)
		return
	}

	// Return UUID
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"uuid": uuid,
	})
}
