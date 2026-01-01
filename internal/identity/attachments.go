package identity

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
)

// AttachmentStore defines the interface for storing and retrieving attachments
// This allows for pluggable storage backends (local file, S3, etc.)
type AttachmentStore interface {
	Save(data []byte, contentType string) (uuid string, err error)
	Get(uuid string) (data []byte, contentType string, err error)
	Delete(uuid string) error
}

// LocalFileStore implements AttachmentStore using local filesystem
type LocalFileStore struct {
	baseDir string
	mu      sync.RWMutex
}

// NewLocalFileStore creates a new local file storage instance
func NewLocalFileStore(baseDir string) (*LocalFileStore, error) {
	if baseDir == "" {
		baseDir = "./data/attachments"
	}

	// Create directory if it doesn't exist
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create attachments directory: %w", err)
	}

	return &LocalFileStore{
		baseDir: baseDir,
	}, nil
}

// Save stores the attachment data and returns a UUID
func (s *LocalFileStore) Save(data []byte, contentType string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Generate UUID for the file
	id := uuid.New().String()

	// Determine file extension from content type
	ext := getExtensionFromContentType(contentType)
	filename := id + ext

	// Write file
	filePath := filepath.Join(s.baseDir, filename)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to write attachment file: %w", err)
	}

	return id, nil
}

// Get retrieves the attachment data by UUID
func (s *LocalFileStore) Get(id string) ([]byte, string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Try to find the file with any extension
	pattern := filepath.Join(s.baseDir, id+".*")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, "", fmt.Errorf("failed to search for attachment: %w", err)
	}

	if len(matches) == 0 {
		return nil, "", fmt.Errorf("attachment not found")
	}

	// Read the file
	data, err := os.ReadFile(matches[0])
	if err != nil {
		return nil, "", fmt.Errorf("failed to read attachment: %w", err)
	}

	// Determine content type from extension
	ext := filepath.Ext(matches[0])
	contentType := getContentTypeFromExtension(ext)

	return data, contentType, nil
}

// Delete removes an attachment by UUID
func (s *LocalFileStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find and delete the file
	pattern := filepath.Join(s.baseDir, id+".*")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return fmt.Errorf("failed to search for attachment: %w", err)
	}

	if len(matches) == 0 {
		return fmt.Errorf("attachment not found")
	}

	if err := os.Remove(matches[0]); err != nil {
		return fmt.Errorf("failed to delete attachment: %w", err)
	}

	return nil
}

// DecodeBase64Image decodes a data URI and returns the binary data and content type
func DecodeBase64Image(dataURI string) ([]byte, string, error) {
	// Expected format: data:image/png;base64,iVBORw0KGgo...
	if !strings.HasPrefix(dataURI, "data:") {
		return nil, "", fmt.Errorf("invalid data URI format")
	}

	// Split by comma to separate metadata from data
	parts := strings.SplitN(dataURI, ",", 2)
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("invalid data URI format")
	}

	// Extract content type from metadata
	metadata := parts[0]
	contentType := ""
	if strings.Contains(metadata, ";") {
		contentType = strings.TrimPrefix(strings.Split(metadata, ";")[0], "data:")
	}

	// Decode base64 data
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode base64: %w", err)
	}

	return data, contentType, nil
}

// ExtractAndSaveImages recursively processes content to find and save base64 images
// Returns the modified content with attachment URLs
func ExtractAndSaveImages(content interface{}, store AttachmentStore) (interface{}, error) {
	switch v := content.(type) {
	case string:
		// Check if this is a base64 image data URI
		if strings.HasPrefix(v, "data:image/") {
			data, contentType, err := DecodeBase64Image(v)
			if err != nil {
				return v, err
			}

			uuid, err := store.Save(data, contentType)
			if err != nil {
				return v, err
			}

			// Return the attachment URL with /api prefix for frontend compatibility
			return fmt.Sprintf("/api/v1/attachments/%s", uuid), nil
		}
		return v, nil

	case map[string]interface{}:
		// Process each field in the map
		result := make(map[string]interface{})
		for key, val := range v {
			processed, err := ExtractAndSaveImages(val, store)
			if err != nil {
				return v, err
			}
			result[key] = processed
		}
		return result, nil

	case []interface{}:
		// Process each item in the array
		result := make([]interface{}, len(v))
		for i, val := range v {
			processed, err := ExtractAndSaveImages(val, store)
			if err != nil {
				return v, err
			}
			result[i] = processed
		}
		return result, nil

	default:
		// Return as-is for other types
		return v, nil
	}
}

// getExtensionFromContentType returns the file extension for a content type
func getExtensionFromContentType(contentType string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ".bin"
	}
}

// getContentTypeFromExtension returns the content type for a file extension
func getContentTypeFromExtension(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}
