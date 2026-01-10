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
          await workspaceApi.waitForReady();
          await runCommand({ command: `mkdir -p ${workspacePath} && cd ${workspacePath}`, silent: true });
          setCwd(workspacePath);
        } catch (error) {
        }
      };

      setupWorkspace();
    }
  }, [activeConversationId, runCommand, setCwd]);
}
