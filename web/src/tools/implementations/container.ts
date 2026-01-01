import { z } from 'zod';
import { type LocalTool } from '../types';
import { useTerminalStore } from '@/store/terminal';
import { useUIStore } from '@/store';

const BASE_URL = '/api/v1/tools/container';

interface ContainerToolResponse {
  success: boolean;
  data?: any;
  output?: string;
  content?: string;
  message?: string;
  error?: string;
  exit_code?: number;
}

export const containerTool: LocalTool = {
  name: 'container_manager',
  description: 'Manage a persistent Ubuntu container sandbox. You can run shell commands, read/write files, and manage the container lifecycle. The container is isolated to your user session. Use this to execute code, manipulate files, or perform system tasks in a safe environment. The container is persistent, so changes (installed packages, files) remain until "reset" is called. Additionally, any code blocks or generated artifacts are automatically uploaded to the workspace for persistence.',
  parameters: z.object({
    action: z.enum(['run_command', 'write_file', 'read_file', 'manage_container']).optional().describe('The action to perform. If omitted, it will be inferred from other parameters.'),
    command: z.string().optional().describe('The shell command to run (required for "run_command"). e.g., "ls -la", "apt-get install -y git", "python3 script.py"'),
    path: z.string().optional().describe('The absolute file path (required for "write_file", "read_file"). e.g., "/tmp/test.txt"'),
    content: z.string().optional().describe('The content to write to the file (required for "write_file").'),
    container_action: z.enum(['start', 'stop', 'reset', 'status', 'create']).optional().describe('Lifecycle action (required for "manage_container"). "start" will create the container if it does not exist. "reset" will destroy and recreate it.'),
  }),
  execute: async ({ action, command, path, content, container_action }) => {
    try {
      // Auto-detect action if not provided
      if (!action) {
        if (command) {
          action = 'run_command';
        } else if (content && path) {
          action = 'write_file';
        } else if (path) {
          action = 'read_file';
        } else if (container_action) {
          action = 'manage_container';
        } else {
          throw new Error('Unable to determine action. Please provide command, path, content, or container_action.');
        }
      }

      if (action === 'run_command' && !command) {
        throw new Error('command is required for run_command action');
      }
      if (action === 'write_file' && (!path || !content)) {
        throw new Error('path and content are required for write_file action');
      }
      if (action === 'read_file' && !path) {
        throw new Error('path is required for read_file action');
      }
      if (action === 'manage_container' && !container_action) {
        throw new Error('container_action is required for manage_container action');
      }

      const store = useTerminalStore.getState();
      const activeConversationId = useUIStore.getState().activeConversationId;

      // Fallback for ID (should generally exist during chat)
      const conversationId = activeConversationId || 'global';

      const currentCwd = store.getCwd(conversationId);
      const cwdToUse = (action === 'run_command' || action === 'write_file' || action === 'read_file') ? currentCwd : undefined;

      // Handle CD for Agent
      let finalCommand = command;
      let isCd = false;
      if (action === 'run_command' && command) {
        const trimmed = command.trim();
        if (trimmed.startsWith('cd ')) {
          const target = trimmed.substring(3).trim();
          if (target) {
            finalCommand = `cd ${target} && pwd`;
            isCd = true;
          }
        }
      }

      // Mark pending in UI
      if (action === 'run_command') {
        store.setPending(true);
      }

      try {
        const response = await fetch(BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            command: finalCommand,
            path,
            content,
            container_action,
            work_dir: cwdToUse,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as ContainerToolResponse;

        if (!result.success) {
          throw new Error(result.error || 'Unknown error from Container Tool');
        }

        // Update Store
        if (action === 'run_command' && command) {
          store.addHistoryItem(conversationId, {
            command: command,
            output: result.output || '',
            cwd: currentCwd,
            source: 'agent',
          });

          if (isCd && result.output && result.exit_code === 0) {
            const newDir = result.output.trim().split('\n').pop()?.trim();
            if (newDir) {
              store.setCwd(conversationId, newDir);
            }
          }
        }

        // Return concise but useful output
        if (action === 'run_command') {
          return result.output || '(No output)';
        }
        if (action === 'read_file') {
          return result.content || '(Empty file)';
        }
        if (action === 'manage_container') {
          return result.data;
        }

        return result.message || 'Operation successful';

      } finally {
        if (action === 'run_command') {
          store.setPending(false);
        }
      }

    } catch (error) {
      throw new Error(`Container Tool Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
