
interface FileEntry {
  name: string;
  size: number;
  mode: string;
  is_dir: boolean;
  mod_time: string;
}

interface ListFilesResponse {
  success: boolean;
  files: FileEntry[];
}

interface UploadFileResponse {
  success: boolean;
  path: string;
  name: string;
  size: number;
}

export const workspaceApi = {
  listFiles: async (conversationId: string): Promise<FileEntry[]> => {
    const res = await fetch(`/api/v1/workspaces/${conversationId}/files`);
    if (!res.ok) {
      throw new Error('Failed to list files');
    }
    const data = await res.json() as ListFilesResponse;
    // ensure files is an array, backend might return null if empty
    return data.files || [];
  },

  uploadFile: async (conversationId: string, file: File): Promise<UploadFileResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/v1/workspaces/${conversationId}/files`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error('Failed to upload file');
    }
    return await res.json() as UploadFileResponse;
  },

  readFile: async (conversationId: string, filename: string): Promise<string> => {
    const res = await fetch(`/api/v1/workspaces/${conversationId}/files/${filename}`);
    if (!res.ok) {
      throw new Error('Failed to read file');
    }
    return await res.text();
  }
};

export type { FileEntry };
