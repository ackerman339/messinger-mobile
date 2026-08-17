import { wsClient } from '@/src/clients/websocket-client';
import { ChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { useCursorPagination } from '@/src/hooks/use-cursor-pagination';
import { conversationService } from '@/src/services/conversation';
import { fileService } from '@/src/services/files';
import { userService } from '@/src/services/user';
import { WS_CLIENT_EVENTS } from '@/src/types/websocket';
import { useEffect, useMemo, useState } from 'react';

import type { ReactNode } from 'react';
import type { Conversation } from '../types/conversation';
import type { FileAttachment, LocalFile, UploadContentType } from '../types/file';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();

  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [activeConversationId, setActiveConversationId] = useState('');
  const [receiverId, setReceiverId] = useState('');

  const { items, isLoading, hasMore, loadMore } = useCursorPagination<Conversation>({
    fetchPage: (cursor) =>
      conversationService.getBootstrap({
        cursor,
        limit: 20,
      }),
    deps: [],
  });

  /**
   * Merge paginated conversations into the context map.
   *
   * Existing conversations have priority because they may
   * contain newer data received through WebSocket events.
   */
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    setConversations((previous) => {
      const next = new Map(previous);

      for (const conversation of items) {
        const existing = next.get(conversation.id);

        next.set(
          conversation.id,
          existing
            ? {
                ...conversation,
                ...existing,
              }
            : conversation,
        );
      }

      return next;
    });
  }, [items]);

  const activeConversation = useMemo(
    () => conversations.get(activeConversationId) || null,
    [conversations, activeConversationId],
  );

  function unSetCurrentConversation() {
    setActiveConversationId('');
  }

  function handleCurrentConversation(conversationId: string) {
    setActiveConversationId(conversationId);
  }

  function handleReceiverId(id: string) {
    setReceiverId(id);
  }

  async function getUserByCode(userCode: string) {
    const response = await userService.getUserByCode({ userCode });

    return response.data.result;
  }

  async function prepareAttachments(files: LocalFile[]) {
    const mappedFiles = files.map((file) => ({
      contentType: file.type as UploadContentType,
      size: file.size,
      fileName: file.name,
    }));

    const result = await fileService.processUpload({ files: mappedFiles });
    const uploadItems = result.presignedUrls;
    const attachments = result.pendingUploads.map((item: any) => {
      return {
        id: item.id,
        fileName: item.fileName,
        size: item.size,
        storageKey: item.storageKey,
        contentType: item.contentType,
      };
    });

    await Promise.all(
      attachments.map(async (item) => {
        const upload = files.find((file) => file.name === item.fileName);
        const uploadItem = uploadItems.find((upload) => upload.key === item.storageKey);

        if (!upload || !uploadItem) {
          throw new Error(`No presigned URL for ${item.fileName}`);
        }

        await fileService.uploadFile(upload, uploadItem.url);
      }),
    );

    return attachments;
  }

  function handleSendMessage(content: string, attachments: FileAttachment[] = []) {
    if (activeConversation && activeConversation.type === 'GROUP') {
      wsClient.emit(WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE, {
        content,
        attachments,
        conversationId: activeConversation.id,
      });
      return;
    }

    const targetReceiverId =
      receiverId || activeConversation?.members.filter((member) => member.id !== user?.id)[0].id;

    if (!targetReceiverId) {
      return;
    }

    wsClient.emit(WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE, {
      content,
      attachments,
      receiverId: targetReceiverId,
    });
  }

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        loadingConversations: isLoading,
        error: null,
        receiverId,
        hasMoreConversations: hasMore,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
        unSetCurrentConversation,
        loadMoreConversations: loadMore,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
