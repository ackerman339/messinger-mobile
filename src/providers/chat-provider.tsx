import { messageSync } from '@/src/services/message-sync';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, BackHandler } from 'react-native';

import { wsClient } from '@/src/clients/websocket-client';
import { ChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { useMessageNotifications } from '@/src/hooks/use-message-notifications';
import { useCursorPagination } from '@/src/hooks/use-cursor-pagination';
import {
  getAllConversations,
  invitationConversation,
  mergeGroup,
} from '@/src/services/groups';
import { conversationService } from '@/src/services/conversation';
import { fileService } from '@/src/services/files';
import { userService } from '@/src/services/user';
import { WS_CLIENT_EVENTS, WS_SERVER_EVENTS } from '@/src/types/websocket';

import type { Conversation } from '@/src/types/conversation';
import type {
  FileAttachment,
  LocalFile,
  UploadContentType,
} from '@/src/types/file';
import type { ReactNode } from 'react';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();

  const [conversations, setConversations] = useState<
    Map<string, Conversation>
  >(new Map());
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [isLoadingAttachment, setIsLoadingAttachment] = useState(false);
  const [emptiedConversation, setEmptiedConversation] = useState<Pick<
    Conversation,
    'id'
  > | null>(null);

  const appState = useRef(AppState.currentState);

  const { items, isLoading, hasMore, loadMore, reload } =
    useCursorPagination<Conversation>({
      fetchPage: (cursor) =>
        conversationService.getBootstrap({
          cursor,
          limit: 20,
        }),
      getItemKey: (conversation) => conversation.id,
      deps: [],
    });

  const connectionEpoch = useSyncExternalStore(
    messageSync.subscribe,
    () => messageSync.getSnapshot().connectionEpoch,
    () => 0,
  );
  const previousConnection = useRef(connectionEpoch);
  useEffect(() => {
    if (connectionEpoch === previousConnection.current) return;
    previousConnection.current = connectionEpoch;
    reload();
  }, [connectionEpoch, reload]);

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
          existing && !existing.invitation
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

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          reload();
        }

        appState.current = nextState;
      },
    );

    return () => subscription.remove();
  }, [reload]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (activeConversationId) {
          setActiveConversationId('');
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [activeConversationId]);

  /**
   * Add a new conversation to the list.
   *
   * This is used when a message arrives for a conversation
   * that wasn't included in the current pagination pages.
   */
  function handleNewConversation(conversation: Conversation) {
    setConversations((previous) => {
      const next = new Map(previous);

      next.set(conversation.id, conversation);

      return next;
    });
  }

  const activeConversation = useMemo(
    () => conversations.get(activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  function handleEmptyChat(conversationId: string) {
    setConversations((previous) => {
      const conversation = previous.get(conversationId);
      if (!conversation) return previous;
      const next = new Map(previous);
      next.set(conversationId, {
        ...conversation,
        messages: [],
        messagesCursor: null,
        lastMessage: undefined,
        members: conversation.members.map((member) =>
          member.userId === user?.id
            ? { ...member, unreadCount: 0 }
            : member,
        ),
      });
      return next;
    });
    setEmptiedConversation({ id: conversationId });
  }

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let disposed = false;
    async function refreshGroup(id: string, joined = false) {
      try {
        const group = (await getAllConversations()).find(
          (item) => item.id === id,
        );
        if (!group || disposed) return;
        setConversations((previous) => {
          if (!joined && !previous.has(id)) return previous;
          const next = new Map(previous);
          next.set(id, mergeGroup(previous.get(id), group));
          return next;
        });
      } catch {
        // Keep the current conversation; bootstrap refreshes it on the next login.
      }
    }
    function remove(id: string) {
      setConversations((previous) => {
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
      setActiveConversationId((current) =>
        current === id ? '' : current,
      );
    }
    function cacheGroupMessage(
      message: import('@/src/types/conversation').Message,
    ) {
      const id = message.conversationId ?? message.conversation?.id;
      if (!id) return;
      setConversations((previous) => {
        const group = previous.get(id);
        if (!group || group.type !== 'GROUP' || group.isDeleted)
          return previous;
        const next = new Map(previous);
        const messages = [message, ...group.messages].filter(
          (item, index, all) =>
            all.findIndex(
              (other) =>
                (other.id || other.messageId) ===
                (item.id || item.messageId),
            ) === index,
        );
        next.set(id, { ...group, messages, lastMessage: message });
        return next;
      });
    }
    const off = [
      wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, cacheGroupMessage),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_INVITATION_REJECTED,
        ({ conversationId }) => remove(conversationId),
      ),
      wsClient.on(WS_SERVER_EVENTS.GROUP_INVITATION, (invitation) => {
        setConversations((previous) => {
          const existing = previous.get(invitation.conversationId);
          if (existing && !existing.invitation) return previous;
          const next = new Map(previous);
          next.set(
            invitation.conversationId,
            invitationConversation(invitation),
          );
          return next;
        });
      }),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_JOINED,
        ({ conversationId, userId: joinedUser }) => {
          void refreshGroup(conversationId, joinedUser === userId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_LEFT,
        ({ conversationId, userId: leftUser }) => {
          if (leftUser === userId) remove(conversationId);
          else void refreshGroup(conversationId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_REMOVED,
        ({ conversationId, removedUserId }) => {
          if (removedUserId === userId) remove(conversationId);
          else void refreshGroup(conversationId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_OWNER_CHANGED,
        ({ conversationId }) => {
          void refreshGroup(conversationId);
        },
      ),
      wsClient.on(WS_SERVER_EVENTS.GROUP_DELETED, ({ conversationId }) =>
        handleGroupDeleted(conversationId),
      ),
      wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
        cacheGroupMessage(message);
        if (
          !message.conversation &&
          message.conversationId &&
          !conversationsRef.current.has(message.conversationId)
        )
          void refreshGroup(message.conversationId, true);
      }),
    ];
    return () => {
      disposed = true;
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.id]);

  function handleGroupDeleted(id: string) {
    setConversations((previous) => {
      const group = previous.get(id);
      if (!group || group.isDeleted) return previous;
      const next = new Map(previous);
      next.set(id, { ...group, isDeleted: true, invitation: undefined });
      return next;
    });
  }

  function handleGroupOwnerChanged(id: string, newOwnerId: string) {
    setConversations((previous) => {
      const group = previous.get(id);
      if (!group || group.isDeleted) return previous;
      const next = new Map(previous);
      next.set(id, {
        ...group,
        groupRevision: (group.groupRevision ?? 0) + 1,
        members: group.members.map((member) => ({
          ...member,
          role: member.userId === newOwnerId ? 'OWNER' : 'MEMBER',
        })),
      });
      return next;
    });
  }

  function handleRemoveConversation(id: string) {
    setConversations((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    setActiveConversationId((current) => (current === id ? '' : current));
  }

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
    setIsLoadingAttachment(true);
    try {
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
          const uploadItem = uploadItems.find(
            (upload) => upload.key === item.storageKey,
          );

          if (!upload || !uploadItem) {
            throw new Error(`No presigned URL for ${item.fileName}`);
          }

          await fileService.uploadFile(upload, uploadItem.url);
        }),
      );

      return attachments;
    } finally {
      setIsLoadingAttachment(false);
    }
  }

  function handleSendMessage(content: string, attachments: FileAttachment[] = []) {
    const userId = user?.id;
    const current = activeConversation && conversationsRef.current.get(activeConversation.id);
    if (!userId || activeConversation?.invitation || activeConversation?.isDeleted || current?.isDeleted) {
      return false;
    }
    if (activeConversation?.type === 'GROUP') {
      return messageSync.enqueue(userId, {
        type: WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE,
        data: { content, attachments, conversationId: activeConversation.id },
      });
    }
    const targetReceiverId = activeConversation
      ? activeConversation.members.find((member) => member.userId !== userId)?.userId || activeConversation.members[0]?.userId
      : receiverId;
    if (!targetReceiverId) return false;
    return messageSync.enqueue(userId, {
      type: WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE,
      data: { content, attachments, receiverId: targetReceiverId },
    });
  }

  useMessageNotifications({
    userId: user?.id,
    conversations,
    activeConversationId,
    openConversation: handleCurrentConversation,
    addConversation: handleNewConversation,
  });

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        loadingConversations: isLoading,
        error: null,
        receiverId,
        hasMoreConversations: hasMore,
        isLoadingAttachment,
        emptiedConversation,
        handleEmptyChat,
        handleRemoveConversation,
        handleGroupDeleted,
        handleGroupOwnerChanged,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
        unSetCurrentConversation,
        loadMoreConversations: loadMore,
        handleNewConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
