package proxy

import (
	"errors"
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
	failedKeys   map[string]time.Time
	timeoutDur   time.Duration
	mu           sync.Mutex
}

func NewCredentialManager(keys []string, timeoutDuration time.Duration) (*CredentialManager, error) {
	if len(keys) == 0 {
		return nil, errors.New(errNoKeys)
	}

	return &CredentialManager{
		keys:         keys,
		currentIndex: 0,
		failedKeys:   make(map[string]time.Time),
		timeoutDur:   timeoutDuration,
	}, nil
}

func (cm *CredentialManager) GetNextKey() (string, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.cleanupExpiredTimeouts()

	attempts := 0
	startIndex := cm.currentIndex

	for attempts < len(cm.keys) {
		key := cm.keys[cm.currentIndex]
		cm.currentIndex = (cm.currentIndex + 1) % len(cm.keys)

		if cm.isKeyAvailableUnlocked(key) {
			return key, nil
		}

		attempts++

		if cm.currentIndex == startIndex && attempts > 0 {
			break
		}
	}

	return "", errors.New(errAllKeysUnavail)
}

func (cm *CredentialManager) MarkKeyFailed(key string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.failedKeys[key] = time.Now().Add(cm.timeoutDur)
}

func (cm *CredentialManager) IsKeyAvailable(key string) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	return cm.isKeyAvailableUnlocked(key)
}

func (cm *CredentialManager) isKeyAvailableUnlocked(key string) bool {
	timeout, exists := cm.failedKeys[key]
	if !exists {
		return true
	}

	return time.Now().After(timeout)
}

func (cm *CredentialManager) cleanupExpiredTimeouts() {
	now := time.Now()
	for key, timeout := range cm.failedKeys {
		if now.After(timeout) {
			delete(cm.failedKeys, key)
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
		if cm.isKeyAvailableUnlocked(key) {
			available++
		}
	}

	return available
}
