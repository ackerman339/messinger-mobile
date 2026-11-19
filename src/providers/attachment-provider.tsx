import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';

import { AttachmentContext } from '@/src/contexts/attachment-context';
import { URL_TTL } from '@/src/lib/constants';
import { fileService } from '@/src/services/files';

import type { DownloadState } from '@/src/contexts/attachment-context';
import type { ReactNode } from 'react';

type AttachmentProviderProps = {
  children: ReactNode;
};

type CachedUrl = {
  url: string;
  expiresAt: number;
};

const cachedAttachmentsDirectory = new Directory(Paths.cache, 'attachments');
const privateAttachmentsDirectory = new Directory(Paths.document, 'attachments');

export function AttachmentProvider({ children }: AttachmentProviderProps) {
  const urlCacheRef = useRef<Map<string, CachedUrl>>(new Map());

  const pendingUrlRequestsRef = useRef<Map<string, Promise<string>>>(new Map());

  const pendingDownloadsRef = useRef<Map<string, Promise<string>>>(new Map());

  const [downloadStates, setDownloadStates] = useState<Map<string, DownloadState>>(new Map());

  /**
   * Return the local file associated
   * with an attachment.
   */
  const getLocalFile = useCallback(
    (attachmentId: string, fileName: string, directory = cachedAttachmentsDirectory) => {
      const extension = getFileExtension(fileName);
      const localFileName = extension ? `${attachmentId}.${extension}` : attachmentId;
      return new File(directory, localFileName);
    },
    [],
  );

  /**
   * Return a valid cached URL.
   */
  const getCachedUrl = useCallback((attachmentId: string) => {
    const cached = urlCacheRef.current.get(attachmentId);

    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      urlCacheRef.current.delete(attachmentId);

      return undefined;
    }

    return cached.url;
  }, []);

  /**
   * Request and cache a presigned URL.
   */
  const getDownloadUrl = useCallback(
    async (attachmentId: string) => {
      const cached = getCachedUrl(attachmentId);

      if (cached) {
        return cached;
      }

      const pending = pendingUrlRequestsRef.current.get(attachmentId);

      if (pending) {
        return pending;
      }

      const request = fileService
        .downloadFile({
          attachmentId,
        })
        .then((result) => {
          urlCacheRef.current.set(attachmentId, {
            url: result.url,
            expiresAt: Date.now() + URL_TTL,
          });

          return result.url;
        })
        .finally(() => {
          pendingUrlRequestsRef.current.delete(attachmentId);
        });

      pendingUrlRequestsRef.current.set(attachmentId, request);

      return request;
    },
    [getCachedUrl],
  );

  /**
   * Return the local URI if the file
   * already exists.
   */
  const getLocalUri = useCallback(
    (attachmentId: string, fileName: string) => {
      const file = getLocalFile(attachmentId, fileName);

      if (file.exists) return file.uri;

      // Includes previously downloaded attachments and voice notes.
      const privateFile = getLocalFile(attachmentId, fileName, privateAttachmentsDirectory);
      return privateFile.exists ? privateFile.uri : undefined;
    },
    [getLocalFile],
  );

  /**
   * Return the current download state.
   */
  const getDownloadState = useCallback(
    (attachmentId: string) => {
      return (
        downloadStates.get(attachmentId) ?? {
          isDownloading: false,
          isDownloaded: false,
          error: null,
        }
      );
    },
    [downloadStates],
  );

  /**
   * Clear the current error.
   */
  const clearError = useCallback((attachmentId: string) => {
    setDownloadStates((previous) => {
      const next = new Map(previous);

      const current = next.get(attachmentId);

      if (!current) {
        return next;
      }

      next.set(attachmentId, {
        ...current,
        error: null,
      });

      return next;
    });
  }, []);

  const downloadAttachment = useCallback(
    async (attachmentId: string, fileName: string, { keepForPlayback = false } = {}) => {
      const localUri = getLocalUri(attachmentId, fileName);
      if (localUri) return localUri;

      const pending = pendingDownloadsRef.current.get(attachmentId);
      if (pending) return pending;

      setDownloadStates((previous) =>
        new Map(previous).set(attachmentId, {
          isDownloading: true,
          isDownloaded: false,
          error: null,
        }),
      );

      const download = (async () => {
        try {
          const url = await getDownloadUrl(attachmentId);
          const directory = keepForPlayback ? privateAttachmentsDirectory : cachedAttachmentsDirectory;
          directory.create({ idempotent: true, intermediates: true });
          const file = getLocalFile(attachmentId, fileName, directory);
          const partial = new File(directory, `${file.name}.part`);

          // Expose a local URI only after the transfer has finished.
          try {
            await File.downloadFileAsync(url, partial, { idempotent: true });
            partial.move(file);
          } catch (error) {
            urlCacheRef.current.delete(attachmentId);
            if (partial.exists) partial.delete();
            throw error;
          }

          setDownloadStates((previous) =>
            new Map(previous).set(attachmentId, {
              isDownloading: false,
              isDownloaded: true,
              error: null,
            }),
          );

          return file.uri;
        } catch (error) {
          setDownloadStates((previous) =>
            new Map(previous).set(attachmentId, {
              isDownloading: false,
              isDownloaded: false,
              error: error instanceof Error ? error.message : 'Error al descargar el archivo.',
            }),
          );
          throw error;
        } finally {
          pendingDownloadsRef.current.delete(attachmentId);
        }
      })();

      pendingDownloadsRef.current.set(attachmentId, download);
      return download;
    },
    [getDownloadUrl, getLocalFile, getLocalUri],
  );

  return (
    <AttachmentContext.Provider
      value={{
        getDownloadUrl,
        getCachedUrl,
        downloadAttachment,
        getLocalUri,
        getDownloadState,
        clearError,
      }}
    >
      {children}
    </AttachmentContext.Provider>
  );
}

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
    return '';
  }

  return fileName
    .slice(lastDotIndex + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
