import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react';
import { useGetSettings, useSaveSettings, type BackendConfig, type Settings } from '@/hooks/useSettings';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { data: settings, isLoading, error } = useGetSettings();
  const saveSettings = useSaveSettings();

  const [editedSettings, setEditedSettings] = useState<Settings | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Initialize edited settings when data loads
  if (settings && !editedSettings) {
    setEditedSettings(JSON.parse(JSON.stringify(settings)));
  }

  const handleSave = async () => {
    if (!editedSettings) return;

    try {
      await saveSettings.mutateAsync(editedSettings);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const addBackend = () => {
    if (!editedSettings) return;

    const newBackend: BackendConfig = {
      name: '',
      base_url: '',
      prefix: '',
      require_api_key: false,
    };

    setEditedSettings({
      ...editedSettings,
      backends: [...editedSettings.backends, newBackend],
    });
  };

  const updateBackend = (index: number, field: keyof BackendConfig, value: any) => {
    if (!editedSettings) return;

    const newBackends = [...editedSettings.backends];
    newBackends[index] = { ...newBackends[index], [field]: value };
    setEditedSettings({ ...editedSettings, backends: newBackends });
  };

  const deleteBackend = (index: number) => {
    if (!editedSettings) return;

    const newBackends = editedSettings.backends.filter((_, i) => i !== index);
    setEditedSettings({ ...editedSettings, backends: newBackends });
  };

  const addAlias = () => {
    if (!editedSettings) return;

    setEditedSettings({
      ...editedSettings,
      aliases: { ...editedSettings.aliases, '': '' },
    });
  };

  const updateAlias = (oldKey: string, newKey: string, value: string) => {
    if (!editedSettings) return;

    const newAliases = { ...editedSettings.aliases };
    if (oldKey !== newKey) {
      delete newAliases[oldKey];
    }
    newAliases[newKey] = value;
    setEditedSettings({ ...editedSettings, aliases: newAliases });
  };

  const deleteAlias = (key: string) => {
    if (!editedSettings) return;

    const newAliases = { ...editedSettings.aliases };
    delete newAliases[key];
    setEditedSettings({ ...editedSettings, aliases: newAliases });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex items-center justify-center">
        <div className="text-terminal-muted">Loading settings...</div>
      </div>
    );
  }

  if (error || !editedSettings) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex items-center justify-center">
        <div className="text-terminal-red">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
            <p className="text-sm text-terminal-muted mt-1">Manage your Chat configuration</p>
          </div>
          <button
            onClick={() => navigate({ to: '/' })}
            className="px-4 py-2 text-sm font-medium border border-terminal-border rounded hover:border-terminal-muted transition"
          >
            ← Back to Chat
          </button>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="mb-6 p-4 bg-terminal-surface border border-terminal-green rounded">
            <p className="text-terminal-green font-medium">
              ✓ Settings saved successfully! Please restart the server for changes to take effect.
            </p>
          </div>
        )}

        {/* Port Configuration */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Server Configuration</h2>
          <div>
            <label className="block text-sm font-medium text-terminal-muted mb-2">
              Listening Port
            </label>
            <input
              type="number"
              value={editedSettings.listening_port}
              onChange={(e) => setEditedSettings({ ...editedSettings, listening_port: parseInt(e.target.value) })}
              className="w-full sm:w-48 px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text"
            />
          </div>
        </div>

        {/* Backends */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Backends</h2>
            <button
              onClick={addBackend}
              className="px-4 py-2 bg-terminal-cyan hover:bg-terminal-cyan/80 text-terminal-bg text-sm font-medium rounded transition"
            >
              + Add Backend
            </button>
          </div>

          <div className="space-y-4">
            {editedSettings.backends.map((backend, index) => (
              <div key={index} className="border border-terminal-border rounded p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-terminal-muted mb-1">Name</label>
                    <input
                      type="text"
                      value={backend.name}
                      onChange={(e) => updateBackend(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                      placeholder="e.g., openai"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-terminal-muted mb-1">Prefix</label>
                    <input
                      type="text"
                      value={backend.prefix}
                      onChange={(e) => updateBackend(index, 'prefix', e.target.value)}
                      className="w-full px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                      placeholder="e.g., openai/"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-terminal-muted mb-1">Base URL</label>
                    <input
                      type="text"
                      value={backend.base_url}
                      onChange={(e) => updateBackend(index, 'base_url', e.target.value)}
                      className="w-full px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                      placeholder="https://api.openai.com"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-terminal-muted mb-1">API Key (optional)</label>
                    <input
                      type="password"
                      value={backend.api_key || ''}
                      onChange={(e) => updateBackend(index, 'api_key', e.target.value)}
                      className="w-full px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                      placeholder="Leave empty to use environment variable"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={backend.require_api_key || false}
                        onChange={(e) => updateBackend(index, 'require_api_key', e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm text-terminal-muted">Require API Key</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={backend.default || false}
                        onChange={(e) => updateBackend(index, 'default', e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm text-terminal-muted">Default</span>
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => deleteBackend(index)}
                      className="px-3 py-1 text-sm text-terminal-red hover:text-terminal-red/80 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Aliases */}
        <div className="bg-terminal-surface rounded border border-terminal-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Model Aliases</h2>
            <button
              onClick={addAlias}
              className="px-4 py-2 bg-terminal-cyan hover:bg-terminal-cyan/80 text-terminal-bg text-sm font-medium rounded transition"
            >
              + Add Alias
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(editedSettings.aliases || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => updateAlias(key, e.target.value, value)}
                  className="flex-1 px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                  placeholder="Alias (e.g., gpt-4)"
                />
                <span className="flex items-center text-terminal-muted">→</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateAlias(key, key, e.target.value)}
                  className="flex-1 px-3 py-2 border border-terminal-border rounded bg-terminal-bg text-terminal-text text-sm"
                  placeholder="Target (e.g., openai/gpt-4-turbo)"
                />
                <button
                  onClick={() => deleteAlias(key)}
                  className="px-3 py-2 text-terminal-red hover:text-terminal-red/80 transition"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate({ to: '/' })}
            className="px-6 py-2 border border-terminal-border rounded hover:border-terminal-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveSettings.isPending}
            className="px-6 py-2 bg-terminal-cyan hover:bg-terminal-cyan/80 disabled:bg-terminal-muted text-terminal-bg rounded font-medium transition"
          >
            {saveSettings.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
