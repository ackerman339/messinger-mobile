import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AudioAttachment } from '@/src/components/attachments/audio-attachment';
import { FileAttachment } from '@/src/components/attachments/file-attachment';
import { ImageAttachment } from '@/src/components/attachments/image-attachment';
import { VideoAttachment } from '@/src/components/attachments/video-attachment';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { useCursorPagination } from '@/src/hooks/use-cursor-pagination';
import { conversationService } from '@/src/services/conversation';
import { fileService } from '@/src/services/files';

import type { Message } from '@/src/types/conversation';

const PAGE_SIZE = 20;

/**
 * Time to wait after the last content size change
 * before performing the initial scroll.
 */
const INITIAL_LAYOUT_DEBOUNCE = 500;

export function MessageList() {
  const { activeConversation } = useChatContext();

  const conversationId = activeConversation?.id ?? null;

  const listRef = useRef<FlatList<Message>>(null);

  /**
   * Indicates whether the list is still performing
   * its initial layout.
   */
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  /**
   * Prevents multiple pagination requests while the
   * user remains at the beginning of the list.
   */
  const loadingMoreRef = useRef(false);

  /**
   * Debounces the initial scroll until the content
   * size stops changing.
   */
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Ensures that the initial scroll is only performed once.
   */
  const initialScrollDoneRef = useRef(false);

  const {
    items: messages,
    isLoading,
    hasMore,
    loadMore,
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
   * Reset the initial scroll state whenever the
   * active conversation changes.
   */
  useEffect(() => {
    setIsInitialLoad(true);

    loadingMoreRef.current = false;
    initialScrollDoneRef.current = false;

    if (initialScrollTimerRef.current) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = null;
    }
  }, [conversationId]);

  /**
   * Handle changes to the total content size.
   *
   * Attachments can change the height of messages after
   * they have been rendered. Every content size change
   * resets the debounce timer.
   *
   * We only scroll once the content has stopped changing.
   */
  const handleContentSizeChange = useCallback(
    (_width: number, _height: number) => {
      if (!isInitialLoad) {
        return;
      }

      if (initialScrollDoneRef.current) {
        return;
      }

      if (messages.length === 0) {
        return;
      }

      if (isLoading) {
        return;
      }

      if (initialScrollTimerRef.current) {
        clearTimeout(initialScrollTimerRef.current);
      }

      initialScrollTimerRef.current = setTimeout(() => {
        if (initialScrollDoneRef.current) {
          return;
        }

        initialScrollDoneRef.current = true;

        /**
         * Wait for the current layout pass to finish
         * before scrolling.
         */
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({
            animated: false,
          });

          /**
           * Switch to normal scrolling mode after the
           * initial position has been established.
           */
          setIsInitialLoad(false);
        });
      }, INITIAL_LAYOUT_DEBOUNCE);
    },
    [isInitialLoad, messages.length, isLoading],
  );

  /**
   * Load older messages when the user reaches
   * the beginning of the list.
   */
  const handleStartReached = useCallback(() => {
    if (!conversationId) {
      return;
    }

    if (isInitialLoad) {
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

    loadingMoreRef.current = true;

    loadMore();
  }, [conversationId, isInitialLoad, hasMore, isLoading, loadMore]);

  /**
   * Unlock pagination when the request finishes.
   */
  useEffect(() => {
    if (!isLoading) {
      loadingMoreRef.current = false;
    }
  }, [isLoading]);

  /**
   * Clean up the initial scroll timer.
   */
  useEffect(() => {
    return () => {
      if (initialScrollTimerRef.current) {
        clearTimeout(initialScrollTimerRef.current);
      }
    };
  }, []);

  const renderItem = useCallback<ListRenderItem<Message>>(
    ({ item }) => <MessageBubble message={item} />,
    [],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

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
      onContentSizeChange={handleContentSizeChange}
      onStartReached={handleStartReached}
      onStartReachedThreshold={0.2}
      maintainVisibleContentPosition={
        isInitialLoad
          ? undefined
          : {
              minIndexForVisible: 1,
            }
      }
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

  const [downloads, setDownloads] = useState<Map<string, string>>(new Map());

  const isOwn = message.senderId === user?.id;

  useEffect(() => {
    if (!message.attachments?.length) {
      return;
    }

    let cancelled = false;

    async function getDownloadUrls() {
      const downloads: {
        id: string;
        url: string;
      }[] = [];

      for (const attachment of message.attachments) {
        try {
          const result = await fileService.downloadFile({
            attachmentId: attachment.id,
          });

          downloads.push({
            id: attachment.id,
            url: result.url,
          });
        } catch (error) {
          console.error(`Failed to get download URL for attachment ${attachment.id}`, error);
        }
      }

      if (!cancelled) {
        setDownloads(new Map(downloads.map((download) => [download.id, download.url])));
      }
    }

    getDownloadUrls();

    return () => {
      cancelled = true;
    };
  }, [message]);

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
            {message.attachments.map((attachment) => {
              const url = downloads.get(attachment.id);

              if (!url) {
                return null;
              }

              return <MessageAttachment key={attachment.id} attachment={attachment} url={url} />;
            })}
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
  url: string;
};

function MessageAttachment({ attachment, url }: MessageAttachmentProps) {
  const { contentType } = attachment;

  if (contentType.startsWith('image/')) {
    return <ImageAttachment url={url} fileName={attachment.fileName} />;
  }

  if (contentType.startsWith('video/')) {
    return <VideoAttachment url={url} />;
  }

  if (contentType.startsWith('audio/')) {
    return <AudioAttachment url={url} />;
  }

  return <FileAttachment url={url} fileName={attachment.fileName} />;
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
