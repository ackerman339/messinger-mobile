import { createContext, useContext } from 'react';

import type { Response } from '@/src/services/user';
import type { Conversation } from '@/src/types/conversation';
import type { FileAttachment, LocalFile } from '@/src/types/file';
import type { User } from '@/src/types/user';

export type ChatContextValue = {
  conversations: Map<string, Conversation>;
  activeConversation: Conversation | null;
  loadingConversations: boolean;
  error: string | null;
  receiverId: string;
  hasMoreConversations: boolean;
  handleSendMessage: (content: string, attachments: FileAttachment[]) => void;
  handleCurrentConversation: (conversationId: string) => void;
  prepareAttachments: (files: LocalFile[]) => Promise<FileAttachment[]>;
  getUserByCode: (userCode: string) => Promise<Response>;
  handleReceiverId: (id: string) => void;
  unSetCurrentConversation: () => void;
  loadMoreConversations: () => void;
};

export const ChatContext = createContext<ChatContextValue>({
  conversations: new Map([]),
  activeConversation: null,
  loadingConversations: false,
  error: null,
  receiverId: '',
  hasMoreConversations: false,
  handleSendMessage: () => {},
  handleCurrentConversation: () => {},
  prepareAttachments: async () => [] as FileAttachment[],
  getUserByCode: async () => ({}) as User,
  handleReceiverId: () => {},
  unSetCurrentConversation: () => {},
  loadMoreConversations: () => {},
});

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useUser must be used within a <UserProvider>');
  return ctx;
}
