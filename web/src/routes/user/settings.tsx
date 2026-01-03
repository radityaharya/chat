import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCheckAuth, useAPIKeys, useCreateAPIKey, useDeleteAPIKey, useLogout } from '@/hooks/useAuth';
import { useHistory } from '@/hooks/useHistory';
import { Copy, Key, LogOut, ArrowLeft, Trash2, User, Sparkles, Loader2, Info } from 'lucide-react';
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
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const { deleteAllHistory } = useHistory();

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'keys' | 'preferences'>('profile');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

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
    }
  };

  const handleDeleteAllHistory = async () => {
    setIsDeletingHistory(true);
    try {
      await deleteAllHistory();
      setShowSuccess("All history deleted successfully!");
      setTimeout(() => setShowSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to delete history', error);
    } finally {
      setIsDeletingHistory(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center font-mono">
        <Loader2 className="w-8 h-8 text-terminal-green animate-spin" />
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex items-center justify-center">
        <div className="text-center">
          <p className="text-terminal-muted mb-4">You need to be logged in to access this page</p>
          <Button onClick={() => navigate({ to: '/login' })} className="border border-terminal-green text-terminal-green hover:bg-terminal-green/10 bg-transparent rounded-none">Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-green/30">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-terminal-border">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate({ to: '/' })}
              className="text-terminal-muted hover:text-terminal-text hover:bg-transparent rounded-none"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-terminal-text">
                User Settings
              </h1>
              <p className="text-terminal-muted text-sm mt-1">
                Manage your account and preferences
              </p>
            </div>
          </div>

          <Button
            onClick={handleLogout}
            disabled={logout.isPending}
            variant="ghost"
            className="text-terminal-red hover:bg-transparent hover:text-terminal-red hover:underline rounded-none transition-none"
          >
            {logout.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-4" />
            )}
            Logout
          </Button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-8 border-b border-terminal-border/30">
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

        {/* Content Area - No animations, straight renders */}
        <div className="min-h-[400px]">

          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-8">
              <div className="border border-terminal-border bg-terminal-surface p-6">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-terminal-green">
                  <span className="text-terminal-muted">#</span> Account Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-terminal-muted uppercase tracking-wider">Username</Label>
                    <div className="px-3 py-2 border border-terminal-border bg-terminal-bg text-terminal-text font-mono">
                      {authStatus.user?.username}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-terminal-muted uppercase tracking-wider">User ID</Label>
                    <div className="px-3 py-2 border border-terminal-border bg-terminal-bg text-terminal-muted font-mono text-sm">
                      {authStatus.user?.id}
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

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="bg-terminal-red/10 text-terminal-red hover:bg-terminal-red hover:text-white border border-terminal-red/30 rounded-none transition-none">
                        <Trash2 className="mr-2 size-4" />
                        Delete All
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-terminal-surface border border-terminal-border font-mono rounded-none sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-terminal-red">Delete All History?</DialogTitle>
                        <DialogDescription className="text-terminal-muted">
                          This action cannot be undone. This will permanently delete your entire conversation history from both your local device and the server.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => { }} className="rounded-none border border-terminal-border hover:bg-terminal-border/20">Cancel</Button>
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

          {/* PREFERENCES TAB */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div className="border border-terminal-border bg-terminal-surface p-6">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-terminal-green">
                  <span className="text-terminal-muted">#</span> Chat Interface
                </h3>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center gap-2">
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

        </div>

        {/* Success Toast */}
        {showSuccess && (
          <div className="fixed bottom-8 right-8 bg-terminal-surface text-terminal-green px-6 py-3 border border-terminal-green font-mono z-50 shadow-md">
            <span className="mr-2">✓</span> {showSuccess}
          </div>
        )}
      </div>
    </div>
  );
}
