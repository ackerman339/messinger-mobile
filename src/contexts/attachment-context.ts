import { createContext, useContext } from 'react';

export type DownloadState = {
  isDownloading: boolean;
  isDownloaded: boolean;
  error: string | null;
};

export type AttachmentContextValue = {
  getDownloadUrl: (attachmentId: string) => Promise<string>;
  getCachedUrl: (attachmentId: string) => string | undefined;
  downloadAttachment: (attachmentId: string, fileName: string) => Promise<string>;
  getLocalUri: (attachmentId: string, fileName: string) => string | undefined;
  getDownloadState: (attachmentId: string) => DownloadState;
  clearError: (attachmentId: string) => void;
};

export const AttachmentContext = createContext<AttachmentContextValue | null>(null);

export function useAttachmentContext() {
  const context = useContext(AttachmentContext);

  if (!context) {
    throw new Error('useAttachmentContext must be used within an AttachmentProvider');
  }

  return context;
}
