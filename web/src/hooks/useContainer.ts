import { useTerminalStore } from '@/store/terminal';
import { useActiveConversationId } from '../store';
import { useMutation } from '@tanstack/react-query';

interface ContainerToolResponse {
  success: boolean;
  data?: any;
  output?: string;
  message?: string;
  error?: string;
  exit_code?: number;
}

const API_ENDPOINT = '/api/v1/tools/container';

export function useContainer() {
  const activeConversationId = useActiveConversationId();
  const {
    setPending,
    addHistoryItem,
    setCwd: setStoreCwd, // Rename to avoid conflict
    getCwd
  } = useTerminalStore();

  const cwd = getCwd(activeConversationId);

  // Wrapper to set CWD for active conversion
  const setCwd = (newCwd: string) => {
    if (activeConversationId) {
      setStoreCwd(activeConversationId, newCwd);
    }
  };

  // Helper to parse cd commands from input
  const parseCd = (cmd: string): string | null => {
    const trimmed = cmd.trim();
    if (trimmed.startsWith('cd ')) {
      return trimmed.substring(3).trim();
    }
    return null;
  };

  const executeMutation = useMutation({
    mutationFn: async ({ command, silent = false }: { command: string; silent?: boolean }) => {
      setPending(true);
      try {
        let finalCommand = command;
        const cdTarget = parseCd(command);

        if (cdTarget) {
          finalCommand = `cd ${cdTarget} && pwd`;
        }

        const res = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'run_command',
            command: finalCommand,
            work_dir: cwd,
          }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = await res.json() as ContainerToolResponse;
        if (!data.success) {
          throw new Error(data.error || 'Unknown error');
        }

        const result = {
          output: data.output || '',
          isCd: !!cdTarget,
          exitCode: data.exit_code,
          cwdAtExecution: cwd
        };

        // Add to history only if not silent
        if (activeConversationId && !silent) {
          addHistoryItem(activeConversationId, {
            command,
            output: result.output,
            cwd: cwd,
            source: 'user'
          });
        }

        // Handle CD updates
        if (result.isCd && result.output && result.exitCode === 0) {
          const newDir = result.output.trim().split('\n').pop()?.trim(); // Get last line in case of noise
          if (newDir) {
            setCwd(newDir);
          }
        }

        return result;

      } finally {
        setPending(false);
      }
    },
    onError: (err) => {
      console.error(`Command failed: ${err.message}`);
    },
  });

  return {
    runCommand: executeMutation.mutateAsync,
    isPending: executeMutation.isPending,
    cwd,
    setCwd,
  };
}
