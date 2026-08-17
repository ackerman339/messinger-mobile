import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { wsClient } from '@/src/clients/websocket-client';
import { AudioAttachment } from '@/src/components/attachments/audio-attachment';
import { FileAttachment } from '@/src/components/attachments/file-attachment';
import { ImageAttachment } from '@/src/components/attachments/image-attachment';
import { VideoAttachment } from '@/src/components/attachments/video-attachment';
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

  /**
   * Prevents an automatic scroll to the bottom
   * when older messages are being loaded.
   */
  const isPaginatingRef = useRef(false);

  /**
   * Indicates that the list should scroll to the bottom
   * after new messages have been rendered.
   */
  const shouldScrollToBottomRef = useRef(false);

  /**
   * Indicates that the conversation has just changed
   * and the initial position should be set to the bottom.
   */
  const initialScrollRef = useRef(true);

  /**
   * Prevents multiple pagination requests from being
   * triggered while the user remains at the beginning.
   */
  const loadingMoreRef = useRef(false);

  const {
    items: messages,
    isLoading,
    hasMore,
    error,
    loadMore,
    setItems,
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
   * Reset the scroll state whenever the active conversation changes.
   */
  useEffect(() => {
    initialScrollRef.current = true;
    shouldScrollToBottomRef.current = true;
    isPaginatingRef.current = false;
    loadingMoreRef.current = false;
  }, [conversationId]);

  /**
   * Subscribe to WebSocket message events.
   *
   * This effect must not depend on `messages`,
   * otherwise new listeners would be registered
   * every time the message list changes.
   */
  useEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      /**
       * Incoming messages should always keep the list at the bottom.
       */
      shouldScrollToBottomRef.current = true;

      setItems((prev) => [...prev, message]);
    });

    const unsubscribeSentMessage = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      /**
       * Sent messages should keep the list at the bottom.
       */
      shouldScrollToBottomRef.current = true;

      setItems((prev) => [...prev, message]);
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeSentMessage();
    };
  }, [setItems]);

  /**
   * Scroll to the bottom after the initial page
   * has finished loading.
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
    }, INITIAL_SCROLL_DELAY);

    return () => clearTimeout(timeout);
  }, [conversationId, isLoading, messages.length]);

  /**
   * Scroll to the bottom after a new message
   * has been added to the list.
   *
   * This is skipped while older messages are being paginated.
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
   * Load older messages when the user reaches
   * the beginning of the list.
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

    /**
     * The next message update will come from pagination,
     * not from a newly received message.
     */
    isPaginatingRef.current = true;
    loadingMoreRef.current = true;

    loadMore();
  }, [conversationId, hasMore, isLoading, loadMore]);

  /**
   * Unlock pagination after the request finishes.
   *
   * `maintainVisibleContentPosition` keeps the previously
   * visible message at the same position while new messages
   * are inserted at the beginning.
   */
  useEffect(() => {
    if (!isLoading) {
      loadingMoreRef.current = false;

      requestAnimationFrame(() => {
        isPaginatingRef.current = false;
      });
    }
  }, [isLoading]);

  const renderItem = useCallback<ListRenderItem<Message>>(({ item }) => {
    const key = item.messageId || item.id;
    return <MessageBubble key={key} message={item} />;
  }, []);

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
        paddingTop: 24,
        paddingBottom: 20,
        gap: 8,
      }}
      style={{
        flex: 1,
      }}
    />
  );
}

type MessageBubbleProps = {
  message: Message;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useUserContext();

  const isOwn = message.senderId === user?.id;

  return (
    <XStack width='100%' justify={isOwn ? 'flex-end' : 'flex-start'}>
      <YStack
        maxW='76%'
        minW={0}
        bg={isOwn ? '$bgBubbleOwn' : '$bgBubbleOther'}
        borderBottomRightRadius={isOwn ? '$1' : '$3'}
        borderBottomLeftRadius={isOwn ? '$3' : '$1'}
        px='$3'
        py='$2'
        elevation='$1'
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
