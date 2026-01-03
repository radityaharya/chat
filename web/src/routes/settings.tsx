import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react';
import { useGetSettings, useSaveSettings, type BackendConfig, type Settings } from '@/hooks/useSettings';
import { Trash2, Save, ArrowLeft, Server, Command, Shield, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { data: settings, isLoading, error } = useGetSettings();
  const saveSettings = useSaveSettings();

  const [editedSettings, setEditedSettings] = useState<Settings | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'backends' | 'aliases'>('backends');

  // Initialize edited settings when data loads
  useEffect(() => {
    if (settings && !editedSettings) {
      setEditedSettings(JSON.parse(JSON.stringify(settings)));
    }
  }, [settings]);

  const handleSave = async () => {
    if (!editedSettings) return;

    try {
      await saveSettings.mutateAsync(editedSettings);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
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
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-terminal-cyan animate-spin" />
      </div>
    );
  }

  if (error || !editedSettings) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-red">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-sans selection:bg-terminal-cyan/30">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate({ to: '/' })}
              className="text-terminal-muted hover:text-terminal-text hover:bg-terminal-surface"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-terminal-cyan to-terminal-blue bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-terminal-muted text-sm mt-1">
                Manage your LLM Router configuration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saveSettings.isPending}
              className="bg-terminal-cyan hover:bg-terminal-cyan/90 text-terminal-bg font-medium shadow-lg shadow-terminal-cyan/20 transition-all active:scale-95"
            >
              {saveSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 mb-8 bg-terminal-surface/50 p-1 rounded-lg w-fit backdrop-blur-sm border border-terminal-border/50">
          {[
            { id: 'backends', label: 'Backends', icon: Server },
            { id: 'aliases', label: 'Aliases', icon: Command },
            { id: 'general', label: 'General', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-terminal-bg text-terminal-cyan shadow-sm border border-terminal-border/50"
                  : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-surface"
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* BACKENDS TAB */}
            {activeTab === 'backends' && (
              <div className="space-y-6">
                {editedSettings.backends.map((backend, index) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={index}
                    className="group bg-terminal-surface/30 backdrop-blur border border-terminal-border rounded-xl p-6 hover:border-terminal-muted/50 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs text-terminal-muted uppercase tracking-wider">Provider Name</Label>
                        <Input
                          value={backend.name}
                          onChange={(e) => updateBackend(index, 'name', e.target.value)}
                          placeholder="e.g. openai"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-terminal-muted uppercase tracking-wider">Model Prefix</Label>
                        <Input
                          value={backend.prefix}
                          onChange={(e) => updateBackend(index, 'prefix', e.target.value)}
                          placeholder="e.g. openai/"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan transition-colors"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs text-terminal-muted uppercase tracking-wider">Base URL</Label>
                        <Input
                          value={backend.base_url}
                          onChange={(e) => updateBackend(index, 'base_url', e.target.value)}
                          placeholder="https://api.openai.com"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan transition-colors"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs text-terminal-muted uppercase tracking-wider">API Key (Optional)</Label>
                        <Input
                          type="password"
                          value={backend.api_key || ''}
                          onChange={(e) => updateBackend(index, 'api_key', e.target.value)}
                          placeholder="Leave empty to use env vars"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-terminal-border/50">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={backend.require_api_key}
                            onCheckedChange={(c) => updateBackend(index, 'require_api_key', c)}
                          />
                          <span className="text-sm text-terminal-muted">Require Client Key</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={backend.default}
                            onCheckedChange={(c) => updateBackend(index, 'default', c)}
                          />
                          <span className="text-sm text-terminal-muted">Default Provider</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteBackend(index)}
                        className="text-terminal-red hover:bg-terminal-red/10 hover:text-terminal-red"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  </motion.div>
                ))}

                <Button
                  onClick={addBackend}
                  className="w-full py-6 border-2 border-dashed border-terminal-border bg-transparent text-terminal-muted hover:border-terminal-cyan hover:text-terminal-cyan transition-all"
                >
                  + Add New Backend Provider
                </Button>
              </div>
            )}

            {/* ALIASES TAB */}
            {activeTab === 'aliases' && (
              <div className="bg-terminal-surface/30 backdrop-blur border border-terminal-border rounded-xl p-6">
                <div className="space-y-4">
                  {Object.entries(editedSettings.aliases || {}).map(([key, value], idx) => (
                    <motion.div
                      key={idx}
                      layout
                      className="flex gap-4 items-center group"
                    >
                      <div className="flex-1">
                        <Input
                          value={key}
                          onChange={(e) => updateAlias(key, e.target.value, value)}
                          placeholder="Alias (e.g. gpt-4)"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan"
                        />
                      </div>
                      <span className="text-terminal-muted">→</span>
                      <div className="flex-1">
                        <Input
                          value={value}
                          onChange={(e) => updateAlias(key, key, e.target.value)}
                          placeholder="Target (e.g. openai/gpt-4-turbo)"
                          className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteAlias(key)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-terminal-muted hover:text-terminal-red"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </motion.div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={addAlias}
                    className="mt-4 border-terminal-border hover:border-terminal-cyan hover:text-terminal-cyan"
                  >
                    + Add Alias
                  </Button>
                </div>
              </div>
            )}

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* Server Config */}
                <div className="bg-terminal-surface/30 backdrop-blur border border-terminal-border rounded-xl p-6">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Server className="size-5 text-terminal-cyan" />
                    Server Configuration
                  </h3>

                  <div className="max-w-xs">
                    <Label className="text-xs text-terminal-muted uppercase tracking-wider mb-2 block">Listening Port</Label>
                    <Input
                      type="number"
                      value={editedSettings.listening_port}
                      onChange={(e) => setEditedSettings({ ...editedSettings, listening_port: parseInt(e.target.value) })}
                      className="bg-terminal-bg/50 border-terminal-border focus:border-terminal-cyan"
                    />
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Success Toast */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-8 right-8 bg-terminal-green text-terminal-bg px-6 py-3 rounded-lg shadow-lg font-medium flex items-center gap-2"
            >
              <Shield className="size-5" />
              Action successful!
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
