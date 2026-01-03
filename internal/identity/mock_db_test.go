package identity

import (
	"time"
)

type MockDatabase struct {
	users         map[int64]*User
	usersByName   map[string]*User
	sessions      map[string]*Session
	apiKeys       map[string]*APIKey
	apiKeysByID   map[int64]*APIKey
	histories     map[int64]map[string]*ConversationHistory
	configs       map[int64]*UserConfig
	nextUserID    int64
	nextSessionID int64
	nextAPIKeyID  int64
	nextHistoryID int64
}

func NewMockDatabase() *MockDatabase {
	return &MockDatabase{
		users:         make(map[int64]*User),
		usersByName:   make(map[string]*User),
		sessions:      make(map[string]*Session),
		apiKeys:       make(map[string]*APIKey),
		apiKeysByID:   make(map[int64]*APIKey),
		histories:     make(map[int64]map[string]*ConversationHistory),
		configs:       make(map[int64]*UserConfig),
		nextUserID:    1,
		nextSessionID: 1,
		nextAPIKeyID:  1,
		nextHistoryID: 1,
	}
}

func (m *MockDatabase) Close() error { return nil }

func (m *MockDatabase) CreateUser(user *User) error {
	user.ID = m.nextUserID
	m.nextUserID++
	user.CreatedAt = time.Now()
	m.users[user.ID] = user
	m.usersByName[user.Username] = user
	return nil
}

func (m *MockDatabase) GetUserByUsername(username string) (*User, error) {
	return m.usersByName[username], nil
}

func (m *MockDatabase) GetUserByID(id int64) (*User, error) {
	return m.users[id], nil
}

func (m *MockDatabase) HasUsers() (bool, error) {
	return len(m.users) > 0, nil
}

func (m *MockDatabase) CreateSession(session *Session) error {
	session.ID = m.nextSessionID
	m.nextSessionID++
	session.CreatedAt = time.Now()
	m.sessions[session.Token] = session
	return nil
}

func (m *MockDatabase) GetSessionByToken(token string) (*Session, error) {
	s := m.sessions[token]
	if s != nil && s.ExpiresAt.After(time.Now()) {
		return s, nil
	}
	return nil, nil
}

func (m *MockDatabase) DeleteSession(token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *MockDatabase) DeleteExpiredSessions() error {
	for t, s := range m.sessions {
		if s.ExpiresAt.Before(time.Now()) {
			delete(m.sessions, t)
		}
	}
	return nil
}

func (m *MockDatabase) CreateAPIKey(key *APIKey) error {
	key.ID = m.nextAPIKeyID
	m.nextAPIKeyID++
	key.CreatedAt = time.Now()
	m.apiKeys[key.KeyHash] = key
	m.apiKeysByID[key.ID] = key
	return nil
}

func (m *MockDatabase) GetAPIKeyByHash(hash string) (*APIKey, error) {
	return m.apiKeys[hash], nil
}

func (m *MockDatabase) GetAPIKeysByUserID(userID int64) ([]APIKey, error) {
	var keys []APIKey
	for _, k := range m.apiKeys {
		if k.UserID == userID {
			keys = append(keys, *k)
		}
	}
	return keys, nil
}

func (m *MockDatabase) DeleteAPIKey(id int64) error {
	k := m.apiKeysByID[id]
	if k != nil {
		delete(m.apiKeys, k.KeyHash)
		delete(m.apiKeysByID, id)
	}
	return nil
}

func (m *MockDatabase) UpdateAPIKeyLastUsed(id int64) error {
	k := m.apiKeysByID[id]
	if k != nil {
		now := time.Now()
		k.LastUsedAt = &now
	}
	return nil
}

func (m *MockDatabase) SaveHistory(userID int64, history *ConversationHistory) error {
	if m.histories[userID] == nil {
		m.histories[userID] = make(map[string]*ConversationHistory)
	}
	if history.ID == 0 {
		history.ID = m.nextHistoryID
		m.nextHistoryID++
		history.CreatedAt = time.Now()
	}
	history.UpdatedAt = time.Now()
	history.UserID = userID
	m.histories[userID][history.ConversationID] = history
	return nil
}

func (m *MockDatabase) GetAllHistory(userID int64) ([]ConversationHistory, error) {
	var list []ConversationHistory
	for _, h := range m.histories[userID] {
		list = append(list, *h)
	}
	return list, nil
}

func (m *MockDatabase) GetHistoryByID(userID int64, conversationID string) (*ConversationHistory, error) {
	if m.histories[userID] == nil {
		return nil, nil
	}
	return m.histories[userID][conversationID], nil
}

func (m *MockDatabase) DeleteHistory(userID int64, conversationID string) error {
	if m.histories[userID] != nil {
		delete(m.histories[userID], conversationID)
	}
	return nil
}

func (m *MockDatabase) DeleteAllHistory(userID int64) error {
	m.histories[userID] = make(map[string]*ConversationHistory)
	return nil
}

func (m *MockDatabase) GetUserConfig(userID int64) (*UserConfig, error) {
	c := m.configs[userID]
	if c == nil {
		return &UserConfig{UserID: userID}, nil
	}
	return c, nil
}

func (m *MockDatabase) UpdateUserConfig(config *UserConfig) error {
	m.configs[config.UserID] = config
	return nil
}
