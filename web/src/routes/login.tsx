import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApiKey, useSetApiKey } from '@/store';
import { useValidateAPIKey } from '@/hooks/useChat';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const apiKey = useApiKey();

  // Redirect to chat if already have API key
  useEffect(() => {
    if (apiKey) {
      navigate({ to: '/' });
    }
  }, [apiKey, navigate]);

  return <APIKeyLoginScreen />;
}

function APIKeyLoginScreen() {
  const navigate = useNavigate();
  const setApiKey = useSetApiKey();
  const validateAPIKey = useValidateAPIKey();

  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inputKey.trim()) {
      setError('API key is required');
      return;
    }

    try {
      await validateAPIKey.mutateAsync(inputKey.trim());
      setApiKey(inputKey.trim());
      navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid API key');
    }
  };

  return (
    <div className="min-h-screen bg-terminal-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-terminal-surface border border-terminal-border rounded-sm p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <h1 className="text-xl font-bold text-terminal-text">
                Chat
              </h1>
            </div>
            <p className="text-terminal-muted text-sm">
              Enter your API key to access the chat
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
                API Key
              </label>
              <Input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="Enter your API key"
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-terminal-red text-sm bg-terminal-red/10 border border-terminal-red/20 rounded px-3 py-2">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={validateAPIKey.isPending}
            >
              {validateAPIKey.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" />
                  Validating...
                </span>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
