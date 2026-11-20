import type { LocationInput } from '../types/location';
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
  isLoadingAttachment: boolean;
  emptiedConversation: Pick<Conversation, 'id'> | null;
  handleEmptyChat: (conversationId: string) => void;
  handleRemoveConversation: (conversationId: string) => void;
  handleGroupDeleted: (conversationId: string) => void;
  handleGroupOwnerChanged: (
    conversationId: string,
    newOwnerId: string,
  ) => void;
  handleSendMessage: (
    content: string,
    attachments: FileAttachment[],
    location?: LocationInput,
  ) => boolean;
  handleCurrentConversation: (conversationId: string) => void;
  prepareAttachments: (files: LocalFile[]) => Promise<FileAttachment[]>;
  getUserByCode: (userCode: string) => Promise<Response>;
  handleReceiverId: (id: string) => void;
  unSetCurrentConversation: () => void;
  loadMoreConversations: () => void;
  handleNewConversation: (conversation: Conversation) => void;
};

export const ChatContext = createContext<ChatContextValue>({
  conversations: new Map([]),
  activeConversation: null,
  loadingConversations: false,
  error: null,
  receiverId: '',
  hasMoreConversations: false,
  isLoadingAttachment: false,
  emptiedConversation: null,
  handleEmptyChat: () => {},
  handleRemoveConversation: () => {},
  handleGroupDeleted: () => {},
  handleGroupOwnerChanged: () => {},
  handleSendMessage: () => false,
  handleCurrentConversation: () => {},
  prepareAttachments: async () => [] as FileAttachment[],
  getUserByCode: async () => ({}) as User,
  handleReceiverId: () => {},
  unSetCurrentConversation: () => {},
  loadMoreConversations: () => {},
  handleNewConversation: () => {},
});

export function useChatContext() {
  const ctx = useContext(ChatContext);

  if (!ctx) {
    throw new Error('useChatContext must be used within a <ChatProvider>');
  }

  return ctx;
}
