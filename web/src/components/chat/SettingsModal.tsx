import { useState } from 'react';
import { useCheckAuth, useAPIKeys, useCreateAPIKey, useDeleteAPIKey, useLogout } from '@/hooks/useAuth';
import { useHistory } from '@/hooks/useHistory';
import { Copy, Key, LogOut, Trash2, User, Sparkles, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUIResponseEnabled, useSetUIResponseEnabled } from '@/store';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { data: authStatus, isLoading: isLoadingAuth } = useCheckAuth();
  const { data: apiKeys, isLoading: isLoadingKeys } = useAPIKeys();
  const createAPIKey = useCreateAPIKey();
  const deleteAPIKey = useDeleteAPIKey();
  const logout = useLogout();
  const { deleteAllHistory } = useHistory();

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'keys' | 'preferences'>('profile');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setShowSuccess("API key copied to clipboard!");
    setTimeout(() => setShowSuccess(null), 3000);
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
      onOpenChange(false);
    }
  };

  const handleDeleteAllHistory = async () => {
    setIsDeletingHistory(true);
    try {
      await deleteAllHistory();
      setShowSuccess("All history deleted successfully!");
      setShowDeleteConfirm(false);
      setTimeout(() => setShowSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to delete history', error);
    } finally {
      setIsDeletingHistory(false);
    }
  };

  if (!authStatus?.authenticated && !isLoadingAuth) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-terminal-bg border-terminal-border text-terminal-text font-mono p-0 overflow-hidden rounded-none sm:rounded-none">
        <DialogHeader className="p-6 border-b border-terminal-border flex flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight text-terminal-text">
              User Settings
            </DialogTitle>
            <DialogDescription className="text-terminal-muted text-sm mt-1">
              Manage your account and preferences
            </DialogDescription>
          </div>
          <Button
            onClick={handleLogout}
            disabled={logout.isPending}
            variant="ghost"
            className="text-terminal-red hover:bg-transparent hover:text-terminal-red hover:underline rounded-none transition-none h-auto p-0"
          >
            {logout.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-4" />
            )}
            Logout
          </Button>
        </DialogHeader>

        <div className="flex flex-col h-[600px] max-h-[80vh]">
          {/* Navigation Tabs */}
          <div className="flex gap-4 px-6 border-b border-terminal-border/30 shrink-0">
            {[
              { id: 'profile', label: 'Profile', icon: User },
              { id: 'keys', label: 'API Keys', icon: Key },
              { id: 'preferences', label: 'Preferences', icon: Sparkles },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-none border-b-2 hover:bg-terminal-surface/50",
                  activeTab === tab.id
                    ? "border-terminal-green text-terminal-green bg-terminal-surface/50"
                    : "border-transparent text-terminal-muted hover:text-terminal-text"
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoadingAuth ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-terminal-green animate-spin" />
              </div>
            ) : (
              <>
                {/* PROFILE TAB */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div className="border border-terminal-border bg-terminal-surface p-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-terminal-green">
                        <span className="text-terminal-muted">#</span> Account Information
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-xs text-terminal-muted uppercase tracking-wider">Username</Label>
                          <div className="px-3 py-2 border border-terminal-border bg-terminal-bg text-terminal-text font-mono">
                            {authStatus?.user?.username}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-terminal-muted uppercase tracking-wider">User ID</Label>
                          <div className="px-3 py-2 border border-terminal-border bg-terminal-bg text-terminal-muted font-mono text-sm">
                            {authStatus?.user?.id}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="border border-terminal-red/50 bg-terminal-surface p-6">
                      <h3 className="text-lg font-medium text-terminal-red mb-4 flex items-center gap-2">
                        <span className="text-terminal-red">!</span> Danger Zone
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-terminal-text">Delete All History</p>
                          <p className="text-sm text-terminal-muted">Permanently delete all conversation history.</p>
                        </div>

                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="bg-terminal-red/10 text-terminal-red hover:bg-terminal-red hover:text-white border border-terminal-red/30 rounded-none transition-none"
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete All
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* API KEYS TAB */}
                {activeTab === 'keys' && (
                  <div className="border border-terminal-border bg-terminal-surface p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-medium text-terminal-green">
                          <span className="text-terminal-muted">#</span> API Keys
                        </h3>
                        <p className="text-sm text-terminal-muted">Manage persistent access keys</p>
                      </div>
                      {!showCreateForm && (
                        <Button
                          onClick={() => setShowCreateForm(true)}
                          className="border border-terminal-green text-terminal-green hover:bg-terminal-green hover:text-terminal-bg bg-transparent rounded-none transition-none"
                        >
                          <Key className="size-4 mr-2" />
                          Create New Key
                        </Button>
                      )}
                    </div>

                    {showCreateForm && (
                      <form
                        onSubmit={handleCreateKey}
                        className="mb-6 p-4 border border-terminal-border bg-terminal-bg"
                      >
                        <h4 className="text-sm font-medium mb-3 text-terminal-text">New API Key</h4>
                        <div className="flex gap-3">
                          <Input
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="Key Name (e.g. My App)"
                            className="flex-1 bg-terminal-bg border-terminal-border rounded-none focus:ring-0 focus:border-terminal-green font-mono"
                            autoFocus
                          />
                          <Button
                            type="submit"
                            disabled={!newKeyName.trim() || createAPIKey.isPending}
                            className="border border-terminal-green text-terminal-green hover:bg-terminal-green hover:text-terminal-bg bg-transparent rounded-none transition-none"
                          >
                            {createAPIKey.isPending ? <Loader2 className="animate-spin size-4" /> : 'Create'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setShowCreateForm(false);
                              setNewKeyName('');
                            }}
                            className="text-terminal-muted hover:text-terminal-text rounded-none"
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}

                    {createdKey && (
                      <div className="mb-6 p-4 border border-terminal-green bg-terminal-bg flex gap-4 items-start">
                        <Key className="size-5 text-terminal-green mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-terminal-green mb-1">Key Created Successfully</h4>
                          <p className="text-sm text-terminal-muted mb-3">Copy this key now, you won't see it again.</p>
                          <div className="flex gap-2">
                            <code className="flex-1 p-2 bg-terminal-surface border border-terminal-border font-mono text-xs text-terminal-text select-all">
                              {createdKey}
                            </code>
                            <Button size="icon-sm" onClick={() => handleCopyKey(createdKey)} className="rounded-none border border-terminal-border hover:bg-terminal-border">
                              <Copy className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <button onClick={() => setCreatedKey(null)} className="text-terminal-muted hover:text-terminal-text">×</button>
                      </div>
                    )}

                    {isLoadingKeys ? (
                      <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-terminal-muted" /></div>
                    ) : apiKeys && apiKeys.length > 0 ? (
                      <div className="space-y-0 border-t border-terminal-border">
                        {apiKeys.map((key) => (
                          <div key={key.id} className="flex items-center justify-between p-4 border-b border-terminal-border hover:bg-terminal-bg/50 transition-none">
                            <div>
                              <div className="flex items-center gap-2 font-medium text-sm">
                                <Key className="size-3 text-terminal-muted" />
                                {key.name}
                              </div>
                              <div className="text-xs text-terminal-muted mt-1 font-mono">
                                <span className="mr-4">Created: {new Date(key.created_at).toLocaleDateString()}</span>
                                {key.last_used_at && <span>Last Used: {new Date(key.last_used_at).toLocaleDateString()}</span>}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteKey(key.id)}
                              className="text-terminal-muted hover:text-terminal-red hover:bg-transparent rounded-none"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-terminal-muted border border-terminal-border border-dashed">
                        <p>No API keys found</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="space-y-6">
                    <div className="border border-terminal-border bg-terminal-surface p-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-terminal-green">
                        <span className="text-terminal-muted">#</span> Chat Interface
                      </h3>

                      <div className="flex items-center justify-between py-2">
                        <div className="space-y-0.5">
                          <Label className="text-base font-medium flex items-center gap-2 text-terminal-text">
                            Rich UI Responses
                            <Info className="size-3 text-terminal-muted" />
                          </Label>
                          <p className="text-sm text-terminal-muted max-w-md">
                            Allow the AI to render interactive components (charts, cards, forms) instead of just text.
                          </p>
                        </div>
                        <Switch
                          checked={uiResponseEnabled}
                          onCheckedChange={setUIResponseEnabled}
                          className="data-[state=checked]:bg-terminal-green data-[state=unchecked]:bg-terminal-border border border-terminal-border"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Success Toast - Absolute within Dialog Content */}
        {showSuccess && (
          <div className="absolute bottom-4 right-4 bg-terminal-surface text-terminal-green px-4 py-2 border border-terminal-green font-mono z-50 shadow-md text-sm">
            <span className="mr-2">✓</span> {showSuccess}
          </div>
        )}
      </DialogContent>

      {/* Internal Delete Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-terminal-surface border border-terminal-border font-mono rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-terminal-red">Delete All History?</DialogTitle>
            <DialogDescription className="text-terminal-muted">
              This action cannot be undone. This will permanently delete your entire conversation history from both your local device and the server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="rounded-none border border-terminal-border hover:bg-terminal-border/20">Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllHistory}
              disabled={isDeletingHistory}
              className="bg-terminal-red text-white hover:bg-terminal-red/90 rounded-none"
            >
              {isDeletingHistory ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : "Yes, Delete Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
