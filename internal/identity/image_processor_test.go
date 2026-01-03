package identity

import (
	"encoding/json"
	"testing"
)

func TestProcessConversationImages(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	mockStore := &MockAttachmentStore{
		data: make(map[string][]byte),
		ct:   make(map[string]string),
	}
	SetGlobalAttachmentStore(mockStore)

	dataURI := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	convData := map[string]interface{}{
		"messages": []interface{}{
			map[string]interface{}{
				"role":    "user",
				"content": dataURI,
			},
		},
	}
	dataBytes, _ := json.Marshal(convData)

	conv := &ConversationHistory{
		ConversationID: "c1",
		Data:           json.RawMessage(dataBytes),
	}

	err := am.processConversationImages(conv)
	if err != nil {
		t.Fatalf("failed to process: %v", err)
	}

	var processedData map[string]interface{}
	json.Unmarshal(conv.Data, &processedData)

	messages := processedData["messages"].([]interface{})
	firstMsg := messages[0].(map[string]interface{})
	content := firstMsg["content"].(string)

	if content == dataURI {
		t.Error("image data URI was not replaced")
	}
	if len(mockStore.data) == 0 {
		t.Error("no attachment was saved to store")
	}
}

// MockAttachmentStore defined in handler/attachments_test.go is not available here.
// I'll redefine it or move it to a shared place if needed.
// For now, I'll redefine it in mock_db_test.go or here.
// I'll add it to mock_db_test.go so it's shared in identity package.
type MockAttachmentStore struct {
	data map[string][]byte
	ct   map[string]string
}

func (m *MockAttachmentStore) Save(data []byte, contentType string) (string, error) {
	id := "uuid-1"
	m.data[id] = data
	m.ct[id] = contentType
	return id, nil
}

func (m *MockAttachmentStore) Get(uuid string) ([]byte, string, error) {
	return m.data[uuid], m.ct[uuid], nil
}

func (m *MockAttachmentStore) Delete(uuid string) error {
	delete(m.data, uuid)
	return nil
}
