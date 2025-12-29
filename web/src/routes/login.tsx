import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApiKey, useSetApiKey } from '@/store';
import { useValidateAPIKey } from '@/hooks/useChat';
import { useCheckSetup, useInitialSetup, useLogin, useCheckAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const apiKey = useApiKey();
  const { data: authStatus, isLoading: isCheckingAuth } = useCheckAuth();
  const { data: setupStatus, isLoading: isCheckingSetup } = useCheckSetup();

  // Redirect to chat if already authenticated (wait for check to complete)
  useEffect(() => {
    if (!isCheckingAuth && (apiKey || authStatus?.authenticated)) {
      navigate({ to: '/' });
    }
  }, [apiKey, authStatus, isCheckingAuth, navigate]);

  if (isCheckingSetup) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Show initial setup if needed
  if (setupStatus?.needs_setup) {
    return <InitialSetupScreen />;
  }

  // Show login options
  return <LoginScreen />;
}

function InitialSetupScreen() {
  const initialSetup = useInitialSetup();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      await initialSetup.mutateAsync({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
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
                Initial Setup
              </h1>
            </div>
            <p className="text-terminal-muted text-sm">
              Create your admin account to get started
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
                Username
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
                Confirm Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
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
              disabled={initialSetup.isPending}
            >
              {initialSetup.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" />
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<'password' | 'apikey'>('password');

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
              Sign in to continue
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors ${mode === 'password'
                ? 'bg-terminal-accent text-terminal-bg'
                : 'bg-terminal-bg text-terminal-muted hover:text-terminal-text'
                }`}
            >
              Username & Password
            </button>
            <button
              type="button"
              onClick={() => setMode('apikey')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors ${mode === 'apikey'
                ? 'bg-terminal-accent text-terminal-bg'
                : 'bg-terminal-bg text-terminal-muted hover:text-terminal-text'
                }`}
            >
              API Key
            </button>
          </div>

          {mode === 'password' ? <PasswordLoginForm /> : <APIKeyLoginForm />}
        </div>
      </div>
    </div>
  );
}

function PasswordLoginForm() {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }

    try {
      await login.mutateAsync({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
          Username
        </label>
        <Input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          autoComplete="username"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-terminal-muted mb-2">
          Password
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
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
        disabled={login.isPending}
      >
        {login.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" />
            Signing in...
          </span>
        ) : (
          'Sign In'
        )}
      </Button>
    </form>
  );
}

function APIKeyLoginForm() {
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
        <p className="text-xs text-terminal-muted mt-2">
          You can generate an API key after logging in with your username and password
        </p>
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
  );
}
