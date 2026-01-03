package proxy

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	errNoKeys         = "at least one API key is required"
	errAllKeysUnavail = "all API keys are currently unavailable due to failures"
)

type CredentialManager struct {
	keys         []string
	currentIndex int
	// failedKeyModels maps "key|model" -> expiration time
	failedKeyModels map[string]time.Time
	timeoutDur      time.Duration
	mu              sync.Mutex
}

func NewCredentialManager(keys []string, timeoutDuration time.Duration) (*CredentialManager, error) {
	if len(keys) == 0 {
		return nil, errors.New(errNoKeys)
	}

	return &CredentialManager{
		keys:            keys,
		currentIndex:    0,
		failedKeyModels: make(map[string]time.Time),
		timeoutDur:      timeoutDuration,
	}, nil
}

func (cm *CredentialManager) GetNextKey(model string) (string, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.cleanupExpiredTimeouts()

	attempts := 0
	startIndex := cm.currentIndex

	for attempts < len(cm.keys) {
		key := cm.keys[cm.currentIndex]
		cm.currentIndex = (cm.currentIndex + 1) % len(cm.keys)

		if cm.isKeyAvailableUnlocked(key, model) {
			return key, nil
		}

		attempts++

		if cm.currentIndex == startIndex && attempts > 0 {
			break
		}
	}

	return "", errors.New(errAllKeysUnavail)
}

func (cm *CredentialManager) MarkKeyFailed(key, model string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	compositeKey := key
	if model != "" {
		compositeKey = fmt.Sprintf("%s|%s", key, model)
	}

	cm.failedKeyModels[compositeKey] = time.Now().Add(cm.timeoutDur)
}

func (cm *CredentialManager) IsKeyAvailable(key, model string) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	return cm.isKeyAvailableUnlocked(key, model)
}

func (cm *CredentialManager) isKeyAvailableUnlocked(key, model string) bool {
	// Check specific model failure
	if model != "" {
		compositeKey := fmt.Sprintf("%s|%s", key, model)
		if timeout, exists := cm.failedKeyModels[compositeKey]; exists {
			if time.Now().Before(timeout) {
				return false
			}
		}
	}

	// Check global key failure (stored with just key as compositeKey)
	if timeout, exists := cm.failedKeyModels[key]; exists {
		if time.Now().Before(timeout) {
			return false
		}
	}

	return true
}

func (cm *CredentialManager) cleanupExpiredTimeouts() {
	now := time.Now()
	for k, timeout := range cm.failedKeyModels {
		if now.After(timeout) {
			delete(cm.failedKeyModels, k)
		}
	}
}

func (cm *CredentialManager) GetKeyCount() int {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	return len(cm.keys)
}

func (cm *CredentialManager) GetAvailableKeyCount() int {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.cleanupExpiredTimeouts()

	available := 0
	for _, key := range cm.keys {
		// We can't really count "available" without a model context,
		// but historically this meant "globally available".
		// We'll check if it's available for "no specific model".
		if cm.isKeyAvailableUnlocked(key, "") {
			available++
		}
	}

	return available
}
