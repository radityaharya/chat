import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCheckAuth, useAPIKeys, useCreateAPIKey, useDeleteAPIKey, useLogout } from '@/hooks/useAuth';
import { Copy, Check, Trash2, Key, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useUIResponseEnabled, useSetUIResponseEnabled } from '@/store';
import { Sparkles } from 'lucide-react';

export const Route = createFileRoute('/user/settings')({
  component: UserSettingsPage,
});

function UserSettingsPage() {
  const navigate = useNavigate();
  const { data: authStatus, isLoading: isLoadingAuth } = useCheckAuth();
  const { data: apiKeys, isLoading: isLoadingKeys } = useAPIKeys();
  const createAPIKey = useCreateAPIKey();
  const deleteAPIKey = useDeleteAPIKey();
  const logout = useLogout();

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const uiResponseEnabled = useUIResponseEnabled();
  const setUIResponseEnabled = useSetUIResponseEnabled();

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const result = await createAPIKey.mutateAsync(newKeyName.trim());
      setCreatedKey(result.key || null);
      setNewKeyName('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  };

  const handleCopyKey = (key: string, id?: number) => {
    navigator.clipboard.writeText(key);
    if (id) {
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteAPIKey.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete API key:', err);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout.mutate();
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex items-center justify-center">
        <div className="text-center">
          <p className="text-terminal-muted mb-4">You need to be logged in to access this page</p>
          <Button onClick={() => navigate({ to: '/login' })}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">User Settings</h1>
            <p className="text-sm text-terminal-muted mt-1">
              Manage your account and API keys
            </p>
          </div>
          <button
            onClick={() => navigate({ to: '/' })}
            className="px-4 py-2 text-sm font-medium border border-terminal-border rounded hover:border-terminal-muted transition flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to Chat
          </button>
        </div>

        {/* Account Information */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-terminal-muted mb-1">
                Username
              </label>
              <div className="px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text">
                {authStatus.user?.username}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-terminal-muted mb-1">
                User ID
              </label>
              <div className="px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-muted text-sm font-mono">
                {authStatus.user?.id}
              </div>
            </div>
          </div>
        </div>

        {/* API Keys Section */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">API Keys</h2>
              <p className="text-sm text-terminal-muted mt-1">
                Create and manage API keys for programmatic access
              </p>
            </div>
            {!showCreateForm && (
              <Button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2"
              >
                <Key className="size-4" />
                Create API Key
              </Button>
            )}
          </div>

          {/* Create API Key Form */}
          {showCreateForm && (
            <form onSubmit={handleCreateKey} className="mb-6 p-4 border border-terminal-border rounded bg-terminal-bg">
              <h3 className="text-sm font-semibold mb-3">Create New API Key</h3>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Enter a name for this key..."
                  className="flex-1"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!newKeyName.trim() || createAPIKey.isPending}
                >
                  {createAPIKey.isPending ? <Spinner size="sm" /> : 'Create'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewKeyName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Newly Created Key Alert */}
          {createdKey && (
            <div className="mb-4 p-4 bg-terminal-green/10 border border-terminal-green/20 rounded">
              <div className="flex items-start gap-3">
                <Key className="size-5 text-terminal-green shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-terminal-green mb-2">
                    API Key Created Successfully!
                  </p>
                  <p className="text-xs text-terminal-muted mb-3">
                    Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-xs font-mono break-all">
                      {createdKey}
                    </code>
                    <Button
                      size="sm"
                      onClick={() => handleCopyKey(createdKey)}
                      className="shrink-0"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <button
                  onClick={() => setCreatedKey(null)}
                  className="text-terminal-muted hover:text-terminal-text"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* API Keys List */}
          {isLoadingKeys ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : apiKeys && apiKeys.length > 0 ? (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border border-terminal-border rounded hover:border-terminal-muted transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Key className="size-4 text-terminal-muted shrink-0" />
                      <span className="font-medium truncate">{key.name}</span>
                    </div>
                    <div className="text-xs text-terminal-muted space-y-0.5">
                      <div>
                        Created: {new Date(key.created_at).toLocaleDateString()}
                      </div>
                      {key.last_used_at && (
                        <div>
                          Last used: {new Date(key.last_used_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteKey(key.id)}
                      disabled={deleteAPIKey.isPending}
                      className="text-terminal-red hover:text-terminal-red/80"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-terminal-muted">
              <Key className="size-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs mt-1">Create one to get started</p>
            </div>
          )}
        </div>

        {/* Chat Settings */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Chat Settings</h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-terminal-muted" />
                  <span className="font-medium">AI UI Responses</span>
                </div>
                <p className="text-sm text-terminal-muted max-w-sm">
                  Allow the AI to render beautiful UI components (like charts, status cards, and forms) for certain types of responses.
                </p>
              </div>
              <Switch
                checked={uiResponseEnabled}
                onCheckedChange={setUIResponseEnabled}
              />
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-terminal-surface rounded border border-terminal-red/20 p-6">
          <h2 className="text-lg font-semibold text-terminal-red mb-4">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Logout</p>
              <p className="text-sm text-terminal-muted mt-1">
                Sign out of your account on this device
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={logout.isPending}
              className="flex items-center gap-2"
            >
              {logout.isPending ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <LogOut className="size-4" />
                  Logout
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
