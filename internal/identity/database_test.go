package identity

import (
	"testing"
)

func TestNormalizeConnString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{
			input:    "postgres://user:pass@localhost/db",
			expected: "postgres://user:pass@localhost/db?sslmode=disable",
		},
		{
			input:    "postgres://user:pass@localhost/db?sslmode=require",
			expected: "postgres://user:pass@localhost/db?sslmode=require",
		},
		{
			input:    "host=localhost port=5432 user=test dbname=test",
			expected: "host=localhost port=5432 user=test dbname=test?sslmode=disable",
		},
		{
			input:    "host=localhost sslmode=prefer",
			expected: "host=localhost sslmode=prefer",
		},
		{
			input:    "postgresql://localhost/db",
			expected: "postgresql://localhost/db?sslmode=disable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := normalizeConnString(tt.input)
			if result != tt.expected {
				t.Errorf("normalizeConnString(%s) = %s, want %s", tt.input, result, tt.expected)
			}
		})
	}
}
