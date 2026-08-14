import { httpClient } from '@/src/clients/http-client';
import type { ApiResponse } from '@/src/types/service-response';
import { File } from 'expo-file-system';
import type {
  DownloadDto,
  FileAttachment,
  LocalFile,
  PresignedUrl,
  UploadDto,
} from '../types/file';

type UploadResponse = {
  presignedUrls: PresignedUrl[];
  pendingUploads: FileAttachment[];
};

type DownloadResponse = {
  url: string;
};

export const fileService = {
  // R2 related service
  uploadFile: async (file: LocalFile, url: string) => {
    const localFile = new File(file.uri);

    if (!localFile.exists) {
      throw new Error(`Local file does not exist: ${file.uri}`);
    }

    const arrayBuffer = await localFile.arrayBuffer();

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`R2 upload failed: ${response.status} ${error}`);
    }
  },

  processUpload: async (data: UploadDto) => {
    const response = await httpClient.post<ApiResponse<UploadResponse>>('/upload', data);

    return response.data.result;
  },

  downloadFile: async (params: DownloadDto) => {
    const response = await httpClient.get<ApiResponse<DownloadResponse>>('/download', { params });

    return response.data.result;
  },
};
