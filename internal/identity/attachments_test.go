package identity

import (
	"os"
	"testing"
)

func TestLocalFileStore(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "attachments_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	store, err := NewLocalFileStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	testData := []byte("hello world")
	contentType := "text/plain"

	// Test Save
	id, err := store.Save(testData, contentType)
	if err != nil {
		t.Fatalf("failed to save: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty id")
	}

	// Test Get
	data, ct, err := store.Get(id)
	if err != nil {
		t.Fatalf("failed to get: %v", err)
	}
	if string(data) != string(testData) {
		t.Errorf("expected %s, got %s", string(testData), string(data))
	}
	if ct != "application/octet-stream" { // text/plain is mapped to .bin which maps to octet-stream
		t.Errorf("expected application/octet-stream, got %s", ct)
	}

	// Test Delete
	err = store.Delete(id)
	if err != nil {
		t.Fatalf("failed to delete: %v", err)
	}

	_, _, err = store.Get(id)
	if err == nil {
		t.Fatal("expected error getting deleted file")
	}
}

func TestDecodeBase64Image(t *testing.T) {
	dataURI := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	data, ct, err := DecodeBase64Image(dataURI)
	if err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if ct != "image/png" {
		t.Errorf("expected image/png, got %s", ct)
	}
	if len(data) == 0 {
		t.Fatal("expected non-empty data")
	}
}

func TestExtractAndSaveImages(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "extract_test")
	defer os.RemoveAll(tempDir)
	store, _ := NewLocalFileStore(tempDir)

	dataURI := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	content := map[string]interface{}{
		"text": "here is an image",
		"img":  dataURI,
		"nested": []interface{}{
			map[string]interface{}{"sub_img": dataURI},
		},
	}

	processed, err := ExtractAndSaveImages(content, store)
	if err != nil {
		t.Fatalf("failed to extract: %v", err)
	}

	pMap := processed.(map[string]interface{})
	if !testing.Short() {
		if pMap["img"].(string) == dataURI {
			t.Errorf("image was not replaced by URL")
		}
		nested := pMap["nested"].([]interface{})
		subImg := nested[0].(map[string]interface{})["sub_img"].(string)
		if subImg == dataURI {
			t.Errorf("nested image was not replaced by URL")
		}
	}
}
