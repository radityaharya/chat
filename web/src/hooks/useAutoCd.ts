import { useEffect, useRef } from 'react';
import { useActiveConversationId } from '@/store';
import { useContainer } from './useContainer';
import { workspaceApi } from '@/api/workspace';

export function useAutoCd() {
  const activeConversationId = useActiveConversationId();
  const { runCommand, setCwd } = useContainer();
  const previousConversationId = useRef<string | null>(null);

  useEffect(() => {
    if (activeConversationId && activeConversationId !== previousConversationId.current) {
      previousConversationId.current = activeConversationId;

      const workspacePath = `/root/workspaces/${activeConversationId}`;

      const setupWorkspace = async () => {
        try {
          // Ensure container is ready
          await workspaceApi.waitForReady();
          // Create directory if it doesn't exist AND cd into it
          await runCommand({ command: `mkdir -p ${workspacePath} && cd ${workspacePath}`, silent: true });
          // Manually update the store CWD since runCommand doesn't detect it for complex commands
          setCwd(workspacePath);
        } catch (error) {
          console.error("Failed to auto-cd to workspace", error);
        }
      };

      setupWorkspace();
    }
  }, [activeConversationId, runCommand, setCwd]);
}
