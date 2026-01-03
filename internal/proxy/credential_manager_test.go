package proxy

import (
	"testing"
	"time"
)

func TestNewCredentialManager(t *testing.T) {
	t.Run("valid initialization", func(t *testing.T) {
		keys := []string{"key1", "key2", "key3"}
		cm, err := NewCredentialManager(keys, 60*time.Second)

		if err != nil {
			t.Errorf("Expected no error, got %v", err)
		}

		if cm == nil {
			t.Fatal("Expected credential manager, got nil")
		}

		if cm.GetKeyCount() != 3 {
			t.Errorf("Expected 3 keys, got %d", cm.GetKeyCount())
		}
	})

	t.Run("empty keys should error", func(t *testing.T) {
		keys := []string{}
		cm, err := NewCredentialManager(keys, 60*time.Second)

		if err == nil {
			t.Error("Expected error for empty keys, got nil")
		}

		if cm != nil {
			t.Error("Expected nil credential manager for empty keys")
		}
	})
}

func TestGetNextKey_RoundRobin(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	cm, _ := NewCredentialManager(keys, 60*time.Second)

	// Test round-robin behavior
	expectedOrder := []string{"key1", "key2", "key3", "key1", "key2", "key3"}

	for i, expected := range expectedOrder {
		key, err := cm.GetNextKey("")
		if err != nil {
			t.Errorf("Iteration %d: Expected no error, got %v", i, err)
		}

		if key != expected {
			t.Errorf("Iteration %d: Expected key %s, got %s", i, expected, key)
		}
	}
}

func TestMarkKeyFailed(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	cm, _ := NewCredentialManager(keys, 1*time.Second)

	// Mark key1 as failed globally
	cm.MarkKeyFailed("key1", "")

	// Check that key1 is not available globally
	if cm.IsKeyAvailable("key1", "") {
		t.Error("Expected key1 to be unavailable after marking as failed")
	}

	// Check that other keys are still available
	if !cm.IsKeyAvailable("key2", "") {
		t.Error("Expected key2 to be available")
	}

	if !cm.IsKeyAvailable("key3", "") {
		t.Error("Expected key3 to be available")
	}
}

func TestGetNextKey_SkipsFailedKeys(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	cm, _ := NewCredentialManager(keys, 2*time.Second)

	// Mark key1 as failed globally
	cm.MarkKeyFailed("key1", "")

	// Next key should be key2 (skipping key1)
	key, err := cm.GetNextKey("")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if key != "key2" {
		t.Errorf("Expected key2 (skipping failed key1), got %s", key)
	}

	// Next should be key3
	key, err = cm.GetNextKey("")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if key != "key3" {
		t.Errorf("Expected key3, got %s", key)
	}

	// Next should be key2 again (still skipping key1)
	key, err = cm.GetNextKey("")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if key != "key2" {
		t.Errorf("Expected key2 (still skipping failed key1), got %s", key)
	}
}

func TestGetNextKey_AllKeysFailed(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	cm, _ := NewCredentialManager(keys, 5*time.Second)

	// Mark all keys as failed
	cm.MarkKeyFailed("key1", "")
	cm.MarkKeyFailed("key2", "")
	cm.MarkKeyFailed("key3", "")

	// Should return error when all keys are unavailable
	key, err := cm.GetNextKey("")
	if err == nil {
		t.Error("Expected error when all keys are failed, got nil")
	}

	if key != "" {
		t.Errorf("Expected empty key when all failed, got %s", key)
	}

	// Check available count
	if cm.GetAvailableKeyCount() != 0 {
		t.Errorf("Expected 0 available keys, got %d", cm.GetAvailableKeyCount())
	}
}

func TestCleanupExpiredTimeouts(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	// Use a very short timeout for testing
	cm, _ := NewCredentialManager(keys, 100*time.Millisecond)

	// Mark key1 as failed
	cm.MarkKeyFailed("key1", "")

	// Verify key1 is unavailable
	if cm.IsKeyAvailable("key1", "") {
		t.Error("Expected key1 to be unavailable immediately after marking as failed")
	}

	// Wait for timeout to expire
	time.Sleep(150 * time.Millisecond)

	// Verify key1 is available again
	if !cm.IsKeyAvailable("key1", "") {
		t.Error("Expected key1 to be available after timeout expired")
	}

	// Should be able to get key1 again
	key, err := cm.GetNextKey("")
	if err != nil {
		t.Errorf("Expected no error after timeout, got %v", err)
	}

	if key != "key1" {
		t.Errorf("Expected to get key1 after timeout expired, got %s", key)
	}
}

func TestGetAvailableKeyCount(t *testing.T) {
	keys := []string{"key1", "key2", "key3", "key4"}
	cm, _ := NewCredentialManager(keys, 2*time.Second)

	// Initially all keys should be available
	if cm.GetAvailableKeyCount() != 4 {
		t.Errorf("Expected 4 available keys initially, got %d", cm.GetAvailableKeyCount())
	}

	// Mark two keys as failed
	cm.MarkKeyFailed("key1", "")
	cm.MarkKeyFailed("key3", "")

	// Should have 2 available keys
	if cm.GetAvailableKeyCount() != 2 {
		t.Errorf("Expected 2 available keys after marking 2 as failed, got %d", cm.GetAvailableKeyCount())
	}
}

func TestConcurrentAccess(t *testing.T) {
	keys := []string{"key1", "key2", "key3"}
	cm, _ := NewCredentialManager(keys, 1*time.Second)

	// Test concurrent access to ensure thread safety
	done := make(chan bool)

	// Spawn multiple goroutines to access the credential manager
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				cm.GetNextKey("")
				cm.IsKeyAvailable("key1", "")
				if j%10 == 0 {
					cm.MarkKeyFailed("key2", "")
				}
			}
			done <- true
		}()
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		<-done
	}

	// If we get here without deadlock or panic, the test passes
	t.Log("Concurrent access test completed successfully")
}

func TestModelSpecificFailure(t *testing.T) {
	keys := []string{"key1"}
	cm, _ := NewCredentialManager(keys, 1*time.Second)

	// Mark key1 failed for model "gpt-4"
	cm.MarkKeyFailed("key1", "gpt-4")

	// Verify key1 is unavailable for gpt-4
	if cm.IsKeyAvailable("key1", "gpt-4") {
		t.Error("Expected key1 to be unavailable for gpt-4")
	}

	// Verify key1 is still available for "gpt-3.5-turbo"
	if !cm.IsKeyAvailable("key1", "gpt-3.5-turbo") {
		t.Error("Expected key1 to be available for gpt-3.5-turbo")
	}

	// Verify key1 is still available globally (no model specified)
	if !cm.IsKeyAvailable("key1", "") {
		t.Error("Expected key1 to be available globally")
	}
}
