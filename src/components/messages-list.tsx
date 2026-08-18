import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, type ListRenderItem } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { wsClient } from '@/src/clients/websocket-client';
import { AudioAttachment } from '@/src/components/attachments/audio-attachment';
import { FileAttachment } from '@/src/components/attachments/file-attachment';
import { ImageAttachment } from '@/src/components/attachments/image-attachment';
import { VideoAttachment } from '@/src/components/attachments/video-attachment';
import { MessageSelectionBar } from '@/src/components/message-selection-bar';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { useCursorPagination } from '@/src/hooks/use-cursor-pagination';
import { conversationService } from '@/src/services/conversation';
import { WS_SERVER_EVENTS } from '@/src/types/websocket';

import type { Message } from '@/src/types/conversation';

const PAGE_SIZE = 20;
const INITIAL_SCROLL_DELAY = 500;

export function MessageList() {
  const { activeConversation } = useChatContext();

  const conversationId = activeConversation?.id ?? null;

  const listRef = useRef<FlatList<Message>>(null);

  const isPaginatingRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  const initialScrollRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isDeletingMessagesLoading, setIsDeletingMessagesLoading] = useState(false);

  const {
    items: messages,
    isLoading,
    hasMore,
    loadMore,
    setItems,
    error,
  } = useCursorPagination<Message>({
    fetchPage: async (cursor) => {
      if (!conversationId) {
        return {
          page: [],
          nextCursor: null,
        };
      }

      return conversationService.getMessages(conversationId, {
        cursor,
        limit: PAGE_SIZE,
      });
    },

    reverse: true,

    deps: [conversationId],
  });

  /**
   * Reset state when changing conversation.
   */
  useEffect(() => {
    initialScrollRef.current = true;
    shouldScrollToBottomRef.current = true;
    isPaginatingRef.current = false;
    loadingMoreRef.current = false;

    setSelectedMessageIds([]);
  }, [conversationId]);

  /**
   * WebSocket messages.
   */
  useEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      if (message.conversation.id !== conversationId) {
        return;
      }

      shouldScrollToBottomRef.current = true;

      setItems((prev) => [...prev, message]);
    });

    const unsubscribeSentMessage = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      if (message.conversation.id !== conversationId) {
        return;
      }

      shouldScrollToBottomRef.current = true;

      setItems((prev) => [...prev, message]);
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeSentMessage();
    };
  }, [conversationId, setItems]);

  /**
   * Initial scroll to bottom.
   */
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (messages.length === 0) {
      return;
    }

    if (!initialScrollRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: false,
      });

      initialScrollRef.current = false;
      shouldScrollToBottomRef.current = false;
    }, INITIAL_SCROLL_DELAY);

    return () => clearTimeout(timeout);
  }, [conversationId, isLoading, messages.length]);

  /**
   * Scroll to bottom after new messages.
   */
  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    if (isPaginatingRef.current) {
      return;
    }

    if (messages.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });

      shouldScrollToBottomRef.current = false;
    });

    return () => cancelAnimationFrame(frame);
  }, [messages]);

  /**
   * Load older messages.
   */
  const handleStartReached = useCallback(() => {
    if (!conversationId) {
      return;
    }

    if (!hasMore) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (loadingMoreRef.current) {
      return;
    }

    isPaginatingRef.current = true;
    loadingMoreRef.current = true;

    loadMore();
  }, [conversationId, hasMore, isLoading, loadMore]);

  /**
   * Unlock pagination.
   */
  useEffect(() => {
    if (!isLoading) {
      loadingMoreRef.current = false;

      requestAnimationFrame(() => {
        isPaginatingRef.current = false;
      });
    }
  }, [isLoading]);

  /**
   * Select/unselect a message.
   */
  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((current) => {
      if (current.includes(messageId)) {
        return current.filter((id) => id !== messageId);
      }

      return [...current, messageId];
    });
  }, []);

  /**
   * Clear selection.
   */
  const clearSelection = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  /**
   * Delete selected messages.
   */
  const deleteMessages = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    if (selectedMessageIds.length === 0) {
      return;
    }

    try {
      setIsDeletingMessagesLoading(true);

      await conversationService.deleteMessages({
        conversationId,
        messagesIds: selectedMessageIds,
      });

      setItems((current) =>
        current.filter((message) => {
          const messageId = message.messageId || message.id;

          return !selectedMessageIds.includes(messageId);
        }),
      );

      setSelectedMessageIds([]);
    } finally {
      setIsDeletingMessagesLoading(false);
    }
  }, [conversationId, selectedMessageIds, setItems]);

  const renderItem = useCallback<ListRenderItem<Message>>(
    ({ item }) => {
      const messageId = item.messageId || item.id;

      return (
        <MessageBubble
          message={item}
          selected={selectedMessageIds.includes(messageId)}
          onSelect={toggleMessageSelection}
        />
      );
    },
    [selectedMessageIds, toggleMessageSelection],
  );

  const keyExtractor = useCallback((item: Message) => item.messageId || item.id, []);

  if (!activeConversation) {
    return <EmptyState label='Selecciona una conversación' />;
  }

  if (isLoading && messages.length === 0) {
    return <EmptyState label='Cargando mensajes...' />;
  }

  if (error && messages.length === 0) {
    return <EmptyState label={error.message} />;
  }

  if (!isLoading && messages.length === 0) {
    return <EmptyState label='No hay mensajes todavía' />;
  }

  return (
    <YStack flex={1} position='relative'>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.2}
        maintainVisibleContentPosition={{
          minIndexForVisible: 1,
        }}
        ListHeaderComponent={
          isLoading && messages.length > 0 ? (
            <YStack py='$2' items='center'>
              <ActivityIndicator />
            </YStack>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: selectedMessageIds.length > 0 ? 76 : 24,
          paddingBottom: 20,
          gap: 8,
        }}
        style={{
          flex: 1,
        }}
      />

      {selectedMessageIds.length > 0 && (
        <MessageSelectionBar
          count={selectedMessageIds.length}
          isLoading={isDeletingMessagesLoading}
          onDelete={deleteMessages}
          onClose={clearSelection}
        />
      )}
    </YStack>
  );
}

type MessageBubbleProps = {
  message: Message;
  selected: boolean;
  onSelect: (messageId: string) => void;
};

function MessageBubble({ message, selected, onSelect }: MessageBubbleProps) {
  const { user } = useUserContext();

  const isOwn = message.senderId === user?.id;
  const messageId = message.messageId || message.id;

  function handlePress() {
    if (!isOwn) {
      return;
    }

    onSelect(messageId);
  }

  return (
    <XStack width='100%' justify={isOwn ? 'flex-end' : 'flex-start'}>
      <Pressable
        onPress={handlePress}
        disabled={!isOwn}
        style={{
          maxWidth: '76%',
          borderRadius: 8,
          borderBottomRightRadius: isOwn ? 4 : 8,
          borderBottomLeftRadius: isOwn ? 8 : 4,
          opacity: 1,
        }}
      >
        <YStack
          minW={0}
          bg={isOwn ? '$bgBubbleOwn' : '$bgBubbleOther'}
          borderBottomRightRadius={isOwn ? '$1' : '$3'}
          borderBottomLeftRadius={isOwn ? '$3' : '$1'}
          px='$3'
          py='$2'
          elevation='$1'
          borderWidth={selected ? 2 : 0}
          borderColor={selected ? '$accent' : 'transparent'}
        >
          {message.content ? (
            <Text fontSize='$3' lineHeight={20} color='$textPrimary'>
              {message.content}
            </Text>
          ) : null}

          {message.attachments?.length ? (
            <YStack gap='$2' my='$2'>
              {message.attachments.map((attachment) => (
                <MessageAttachment key={attachment.id} attachment={attachment} />
              ))}
            </YStack>
          ) : null}

          <XStack justify='flex-end' items='center' gap='$1' mt='$1'>
            <Text fontSize='$1' color='$textSecondary'>
              {format(new Date(message.createdAt), 'dd MMM HH:mm', {
                locale: es,
              })}
            </Text>

            {isOwn ? (
              <Text fontSize='$2' color='$accent'>
                ✓✓
              </Text>
            ) : null}
          </XStack>
        </YStack>
      </Pressable>
    </XStack>
  );
}

type MessageAttachmentProps = {
  attachment: Message['attachments'][number];
};

function MessageAttachment({ attachment }: MessageAttachmentProps) {
  const { contentType, id, fileName } = attachment;

  if (contentType.startsWith('image/')) {
    return <ImageAttachment attachmentId={id} fileName={fileName} />;
  }

  if (contentType.startsWith('video/')) {
    return <VideoAttachment attachmentId={id} fileName={fileName} />;
  }

  if (contentType.startsWith('audio/')) {
    return <AudioAttachment attachmentId={id} fileName={fileName} />;
  }

  return <FileAttachment attachmentId={id} fileName={fileName} contentType={contentType} />;
}

function EmptyState({ label }: { label: string }) {
  return (
    <YStack flex={1} items='center' justify='center' bg='$bgApp'>
      <YStack bg='$bgApp' px='$4' py='$2' elevation='$1'>
        <Text fontSize='$3' color='$textSecondary'>
          {label}
        </Text>
      </YStack>
    </YStack>
  );
}
