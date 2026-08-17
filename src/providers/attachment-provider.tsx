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

const attachmentsDirectory = new Directory(Paths.document, 'attachments');

export function AttachmentProvider({ children }: AttachmentProviderProps) {
  const urlCacheRef = useRef<Map<string, CachedUrl>>(new Map());

  const pendingUrlRequestsRef = useRef<Map<string, Promise<string>>>(new Map());

  const pendingDownloadsRef = useRef<Map<string, Promise<string>>>(new Map());

  const [downloadStates, setDownloadStates] = useState<Map<string, DownloadState>>(new Map());

  /**
   * Return the local file associated
   * with an attachment.
   */
  const getLocalFile = useCallback((attachmentId: string, fileName: string) => {
    const extension = getFileExtension(fileName);

    const localFileName = extension ? `${attachmentId}.${extension}` : attachmentId;

    return new File(attachmentsDirectory, localFileName);
  }, []);

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

      if (!file.exists) {
        return undefined;
      }

      return file.uri;
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

  /**
   * Download an attachment to the
   * local filesystem.
   */
  const downloadAttachment = useCallback(
    async (attachmentId: string, fileName: string) => {
      /**
       * Check whether the file already
       * exists on the device.
       */
      const existingUri = getLocalUri(attachmentId, fileName);

      if (existingUri) {
        setDownloadStates((previous) => {
          const next = new Map(previous);

          next.set(attachmentId, {
            isDownloading: false,
            isDownloaded: true,
            error: null,
          });

          return next;
        });

        return existingUri;
      }

      /**
       * Reuse an existing download
       * if another component is already
       * downloading the same attachment.
       */
      const pending = pendingDownloadsRef.current.get(attachmentId);

      if (pending) {
        return pending;
      }

      /**
       * Only download using a valid
       * cached URL.
       *
       * We intentionally don't request
       * a new URL here.
       */
      const url = getCachedUrl(attachmentId);

      if (!url) {
        const error = new Error('La URL de descarga ha expirado.');

        setDownloadStates((previous) => {
          const next = new Map(previous);

          next.set(attachmentId, {
            isDownloading: false,
            isDownloaded: false,
            error: error.message,
          });

          return next;
        });

        throw error;
      }

      /**
       * Mark the attachment as downloading
       * before starting the filesystem operation.
       */
      setDownloadStates((previous) => {
        const next = new Map(previous);

        next.set(attachmentId, {
          isDownloading: true,
          isDownloaded: false,
          error: null,
        });

        return next;
      });

      const download = (async () => {
        try {
          if (!attachmentsDirectory.exists) {
            attachmentsDirectory.create({
              intermediates: true,
            });
          }

          /**
           * Check again in case another
           * operation created the file.
           */
          const existing = getLocalUri(attachmentId, fileName);

          if (existing) {
            setDownloadStates((previous) => {
              const next = new Map(previous);

              next.set(attachmentId, {
                isDownloading: false,
                isDownloaded: true,
                error: null,
              });

              return next;
            });

            return existing;
          }

          const file = getLocalFile(attachmentId, fileName);

          /**
           * Download directly from R2
           * to the permanent local file.
           */
          await File.downloadFileAsync(url, file);

          /**
           * Verify that the file
           * actually exists.
           */
          if (!file.exists) {
            throw new Error('El archivo no se pudo guardar correctamente.');
          }

          /**
           * Mark the attachment as
           * successfully downloaded.
           *
           * This state update causes
           * all consumers to re-render.
           */
          setDownloadStates((previous) => {
            const next = new Map(previous);

            next.set(attachmentId, {
              isDownloading: false,
              isDownloaded: true,
              error: null,
            });

            return next;
          });

          return file.uri;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error al descargar el archivo.';

          setDownloadStates((previous) => {
            const next = new Map(previous);

            next.set(attachmentId, {
              isDownloading: false,
              isDownloaded: false,
              error: message,
            });

            return next;
          });

          throw error;
        } finally {
          pendingDownloadsRef.current.delete(attachmentId);
        }
      })();

      pendingDownloadsRef.current.set(attachmentId, download);

      return download;
    },
    [getCachedUrl, getLocalFile, getLocalUri],
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
