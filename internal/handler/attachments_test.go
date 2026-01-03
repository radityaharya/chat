package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

type MockAttachmentStore struct {
	data map[string][]byte
	ct   map[string]string
}

func (m *MockAttachmentStore) Save(data []byte, contentType string) (string, error) {
	id := fmt.Sprintf("test-uuid-%d", len(m.data))
	m.data[id] = data
	m.ct[id] = contentType
	return id, nil
}

func (m *MockAttachmentStore) Get(uuid string) ([]byte, string, error) {
	data, ok := m.data[uuid]
	if !ok {
		return nil, "", fmt.Errorf("not found")
	}
	return data, m.ct[uuid], nil
}

func (m *MockAttachmentStore) Delete(uuid string) error {
	delete(m.data, uuid)
	delete(m.ct, uuid)
	return nil
}

func TestHandleAttachment(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{Logger: logger}

	mockStore := &MockAttachmentStore{
		data: map[string][]byte{"uuid1": []byte("test-data")},
		ct:   map[string]string{"uuid1": "image/png"},
	}
	SetAttachmentStore(mockStore)

	t.Run("Valid Attachment", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/v1/attachments/uuid1", nil)
		rr := httptest.NewRecorder()

		HandleAttachment(rr, req, cfg)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}
		if rr.Header().Get("Content-Type") != "image/png" {
			t.Errorf("expected image/png, got %s", rr.Header().Get("Content-Type"))
		}
		if rr.Body.String() != "test-data" {
			t.Errorf("expected test-data, got %s", rr.Body.String())
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/v1/attachments/nonexistent", nil)
		rr := httptest.NewRecorder()

		HandleAttachment(rr, req, cfg)

		if rr.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rr.Code)
		}
	})
}

func TestHandleAttachmentUpload(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{Logger: logger}

	mockStore := &MockAttachmentStore{
		data: make(map[string][]byte),
		ct:   make(map[string]string),
	}
	SetAttachmentStore(mockStore)

	// Base64 for simple 1x1 png
	base64Data := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

	uploadReq := map[string]string{
		"data":        base64Data,
		"contentType": "image/png",
	}
	body, _ := json.Marshal(uploadReq)

	req, _ := http.NewRequest("POST", "/v1/attachments/upload", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()

	HandleAttachmentUpload(rr, req, cfg)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["uuid"] == "" {
		t.Errorf("expected uuid in response")
	}
}
