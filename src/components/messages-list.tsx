import { useIsFocused } from '@react-navigation/native';
import { messageSync, pendingForConversation, getDeliveryStatus, mergeMessageHistory } from '@/src/services/message-sync';
import { MessageDeliveryIcon } from './message-delivery-icon';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  FlatList,
  Pressable,
} from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { wsClient } from '@/src/clients/websocket-client';
import { AudioAttachment } from '@/src/components/attachments/audio-attachment';
import { FileAttachment } from '@/src/components/attachments/file-attachment';
import { ImageAttachment } from '@/src/components/attachments/image-attachment';
import { MessageAttachmentDownload } from '@/src/components/attachments/message-attachment-download';
import { VideoAttachment } from '@/src/components/attachments/video-attachment';
import { MessageSelectionBar } from '@/src/components/message-selection-bar';
import { UploadingIndicator } from '@/src/components/uploading-indicator';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { useCursorPagination } from '@/src/hooks/use-cursor-pagination';
import { conversationService } from '@/src/services/conversation';
import { MessageStatus, WS_SERVER_EVENTS } from '@/src/types/websocket';
import { ConversationEventMessage } from './conversation-event-message';

import type {
  ConversationEvent,
  Message,
} from '@/src/types/conversation';
import type { ListRenderItem, ViewToken } from 'react-native';

const PAGE_SIZE = 20;
const INITIAL_SCROLL_DELAY = 500;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 5 };

export function MessageList() {
  const { user } = useUserContext();
  const { activeConversation, isLoadingAttachment, emptiedConversation } =
    useChatContext();

  const conversationId = activeConversation?.id ?? null;

  const listRef = useRef<FlatList<Message>>(null);

  const isPaginatingRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  const initialScrollRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>(
    [],
  );
  const [isDeletingMessagesLoading, setIsDeletingMessagesLoading] =
    useState(false);

  const {
    items: serverMessages,
    isLoading,
    hasMore,
    loadMore,
    setItems,
    error,
    refresh,
    reload,
  } = useCursorPagination<Message>({
    fetchPage: (cursor) => {
      if (!activeConversation) return Promise.resolve({ page: [], nextCursor: null });
      if (activeConversation.isDeleted || (!cursor && !messageSync.getSnapshot().connected)) {
        return Promise.resolve({ page: [...(activeConversation.messages ?? [])].reverse(), nextCursor: null });
      }
      return conversationService.getMessages(activeConversation.id, { cursor, limit: PAGE_SIZE });
    },
    mergePage: mergeMessageHistory,

    deps: [conversationId],
  });

  const { pending, connectionEpoch, updates } = useSyncExternalStore(
    messageSync.subscribe,
    messageSync.getSnapshot,
    messageSync.getServerSnapshot,
  );
  const queued = useMemo(() => pendingForConversation(pending, activeConversation, user?.id), [pending, activeConversation, user?.id]);
  const messages = useMemo(() => {
    const confirmed = new Set(serverMessages.map((message) => message.clientMessageId));
    return [...serverMessages, ...queued.filter((message) => !confirmed.has(message.clientMessageId))];
  }, [serverMessages, queued]);
  const previousConnection = useRef(connectionEpoch);

  useEffect(() => {
    if (connectionEpoch === previousConnection.current) return;
    previousConnection.current = connectionEpoch;
    if (conversationId && !activeConversation?.isDeleted) reload();
  }, [activeConversation?.isDeleted, connectionEpoch, conversationId, reload]);

  useEffect(() => {
    if (activeConversation?.isDeleted) return;
    for (const message of serverMessages) messageSync.receipt(message, MessageStatus.DELIVERED);
  }, [activeConversation?.isDeleted, serverMessages]);

  const isFocused = useIsFocused();
  const focused = useRef(isFocused);
  const visible = useRef<ViewToken<Message>[]>([]);
  const markVisibleRead = useCallback(() => {
    if (!focused.current || AppState.currentState !== 'active') return;
    for (const { item, isViewable } of visible.current) {
      if (isViewable && !item.localStatus && (item.conversationId ?? item.conversation?.id) === conversationId) {
        messageSync.receipt(item, MessageStatus.READ);
      }
    }
  }, [conversationId]);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Message>[] }) => {
    visible.current = viewableItems;
    markVisibleRead();
  }, [markVisibleRead]);
  useEffect(() => {
    focused.current = isFocused && !activeConversation?.isDeleted;
    markVisibleRead();
    const subscription = AppState.addEventListener('change', markVisibleRead);
    return () => subscription.remove();
  }, [activeConversation?.isDeleted, isFocused, markVisibleRead]);

  useEffect(() => {
    if (!emptiedConversation || emptiedConversation.id !== conversationId)
      return;
    refresh();
    setSelectedMessageIds([]);
  }, [emptiedConversation, conversationId, refresh]);

  useEffect(() => {
    if (activeConversation?.groupRevision && !activeConversation.isDeleted)
      refresh();
  }, [
    activeConversation?.groupRevision,
    activeConversation?.isDeleted,
    refresh,
  ]);

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
    let live = true;
    const unsubscribeNewMessage = wsClient.on(
      WS_SERVER_EVENTS.NEW_MESSAGE,
      (message) => {
        if (!live) return;
        if (
          (message.conversation?.id ?? message.conversationId) !==
          conversationId
        ) {
          return;
        }

        shouldScrollToBottomRef.current = true;

        setItems((prev) =>
          prev.some(
            (item) =>
              (item.messageId || item.id) ===
              (message.messageId || message.id),
          )
            ? prev
            : [...prev, message],
        );
      },
    );

    const unsubscribeSentMessage = wsClient.on(
      WS_SERVER_EVENTS.MESSAGE_SENT,
      (message) => {
        if (!live) return;
        if (
          (message.conversation?.id ?? message.conversationId) !==
          conversationId
        ) {
          return;
        }

        shouldScrollToBottomRef.current = true;

        setItems((prev) =>
          prev.some(
            (item) =>
              (item.messageId || item.id) ===
              (message.messageId || message.id),
          )
            ? prev
            : [...prev, message],
        );
      },
    );

    function appendCallEvent({
      conversationEvent,
    }: {
      conversationEvent?: ConversationEvent;
    }) {
      if (
        !live ||
        !conversationEvent ||
        conversationEvent.conversationId !== conversationId
      )
        return;
      shouldScrollToBottomRef.current = true;
      setItems((current) =>
        current.some(
          (item) => (item.messageId || item.id) === conversationEvent.id,
        )
          ? current
          : [
              ...current,
              {
                ...conversationEvent,
                messageId: conversationEvent.id,
                senderId: conversationEvent.actorId,
                content: '',
                attachments: [],
                conversation: activeConversation!,
              },
            ],
      );
    }
    const offHistoryDeleted = wsClient.on(
      'CALL_HISTORY_DELETED',
      ({ callId }) => {
        if (!live) return;
        setItems((current) =>
          current.filter(
            (item) =>
              (item.type !== 'CALL_ACCEPTED' &&
                item.type !== 'CALL_END') ||
              (callId && item.metadata?.callId !== callId),
          ),
        );
      },
    );
    const offEnd = wsClient.on('CALL_END', appendCallEvent);
    const offGroupStarted = wsClient.on('GROUP_CALL_STARTED', appendCallEvent);
    const offGroupEnded = wsClient.on('GROUP_CALL_ENDED', appendCallEvent);
    const offReject = wsClient.on('CALL_REJECT', appendCallEvent);

    return () => {
      live = false;
      unsubscribeNewMessage();
      unsubscribeSentMessage();
      offEnd();
      offGroupStarted();
      offGroupEnded();
      offHistoryDeleted();
      offReject();
    };
  }, [conversationId, activeConversation, setItems]);

  useEffect(() => {
    if (!queued.length) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [queued.length]);

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
  const toggleMessageSelection = useCallback(
    (messageId: string) => {
      setSelectedMessageIds((current) => {
        if (current.includes(messageId)) {
          return current.filter((id) => id !== messageId);
        }

        const message = messages.find(
          (item) => (item.messageId || item.id) === messageId,
        );
        if (!message || message.localStatus) return current;
        if (
          message.senderId !== user?.id &&
          (message.content === '' || message.attachments?.length)
        )
          return current;
        if (current.length > 0) {
          const selectedAreOwn = current.every((id) =>
            messages.some(
              (item) =>
                (item.messageId || item.id) === id &&
                item.senderId === user?.id,
            ),
          );
          if (!user || message.senderId !== user.id || !selectedAreOwn)
            return current;
        }

        return [...current, messageId];
      });
    },
    [messages, user],
  );

  /**
   * Clear selection.
   */
  const clearSelection = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const selectedMessages = messages.filter((message) =>
    selectedMessageIds.includes(message.messageId || message.id),
  );
  const canDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every(
      (message) => !!user && message.senderId === user.id,
    );
  const selectedText =
    selectedMessageIds.length === 1 &&
    selectedMessages.length === 1 &&
    !selectedMessages[0].attachments?.length
      ? selectedMessages[0].content
      : '';

  async function copyMessages() {
    if (!selectedText) return;
    try {
      if (!(await Clipboard.setStringAsync(selectedText)))
        throw new Error();
      clearSelection();
    } catch {
      Alert.alert('No se pudo copiar el texto. Inténtalo de nuevo.');
    }
  }

  /**
   * Delete selected messages.
   */
  const deleteMessages = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    if (!canDelete) {
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
  }, [conversationId, selectedMessageIds, setItems, canDelete]);

  const renderItem = useCallback<ListRenderItem<Message>>(
    ({ item }) => {
      const messageId = item.messageId || item.id;

      return (
        <MessageBubble
          message={item}
          status={item.localStatus ?? getDeliveryStatus(item.deliveries ?? [], updates.get(messageId))}
          selected={selectedMessageIds.includes(messageId)}
          onSelect={toggleMessageSelection}
        />
      );
    },
    [selectedMessageIds, toggleMessageSelection, updates],
  );

  const keyExtractor = useCallback(
    (item: Message) => item.messageId || item.id,
    [],
  );

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
      {selectedMessageIds.length > 0 && (
        <MessageSelectionBar
          count={selectedMessageIds.length}
          isLoading={isDeletingMessagesLoading}
          canCopy={selectedText !== ''}
          canDelete={canDelete}
          onCopy={copyMessages}
          onDelete={deleteMessages}
          onClose={clearSelection}
        />
      )}
      {isLoadingAttachment && <UploadingIndicator />}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged}
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
    </YStack>
  );
}

type MessageBubbleProps = {
  status: React.ComponentProps<typeof MessageDeliveryIcon>['status'];
  message: Message;
  selected: boolean;
  onSelect: (messageId: string) => void;
};

function MessageBubble({
  message,
  status,
  selected,
  onSelect,
}: MessageBubbleProps) {
  const { user } = useUserContext();
  const { activeConversation, conversations } = useChatContext();

  if (message.type && message.type !== 'MESSAGE') {
    return (
      <ConversationEventMessage
        message={message}
        members={[
          ...(activeConversation?.members ?? []),
          ...(activeConversation?.knownMembers ?? []),
          ...[...(conversations?.values() ?? [])].flatMap(
            (conversation) => conversation.members,
          ),
        ]}
        isOwn={!!user && message.metadata?.callerId === user.id}
      />
    );
  }

  const isOwn = message.senderId === user?.id;
  const senderName =
    activeConversation?.type === 'GROUP'
      ? activeConversation.members
          .find((member) => member.userId === message.senderId)
          ?.username?.trim() ||
        activeConversation.knownMembers
          ?.find((member) => member.userId === message.senderId)
          ?.username?.trim() ||
        (isOwn ? user?.username?.trim() : undefined) ||
        'Miembro del grupo'
      : null;
  const isLink = /^https?:\/\/\S+$/.test(message.content.trim());
  const messageId = message.messageId || message.id;

  function handlePress() {
    if (message.localStatus === 'FAILED') {
      Alert.alert('No se pudo enviar', undefined, [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'Quitar', onPress: () => messageSync.discard(messageId) },
      ]);
    } else if (!message.localStatus) onSelect(messageId);
  }

  return (
    <XStack width='100%' justify={isOwn ? 'flex-end' : 'flex-start'}>
      <Pressable
        onPress={handlePress}
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
          {senderName && (
            <Text mb='$1' fontSize='$2' fontWeight='600' color='$accent' numberOfLines={1}>
              {senderName}
            </Text>
          )}
          <Text
            fontSize='$3'
            lineHeight={20}
            color={isLink ? '$accent' : '$textPrimary'}
            textDecorationLine={isLink ? 'underline' : 'none'}
          >
            {message.content}
          </Text>
          {message.attachments?.length ? (
            <YStack gap='$2' my='$2'>
              {message.attachments.map((attachment) => message.localStatus ? (
                <Text key={attachment.id} fontSize='$2' color='$textSecondary'>{attachment.fileName}</Text>
              ) : (
                <MessageAttachment
                  key={attachment.id}
                  attachment={attachment}
                  isVoiceMessage={
                    message.attachments.length === 1 &&
                    message.content?.trim().toLowerCase() === 'nota de voz'
                  }
                />
              ))}
            </YStack>
          ) : null}
          <XStack justify='flex-end' items='center' gap='$1' mt='$1'>
            <Text fontSize='$1' color='$textSecondary'>
              {format(new Date(message.createdAt), 'dd MMM hh:mm a', {
                locale: es,
              })}
            </Text>

            {isOwn && <MessageDeliveryIcon status={status} />}
          </XStack>
        </YStack>
      </Pressable>
    </XStack>
  );
}

type MessageAttachmentProps = {
  attachment: Message['attachments'][number];
  isVoiceMessage: boolean;
};

function MessageAttachment({ attachment, isVoiceMessage }: MessageAttachmentProps) {
  const { contentType, id, fileName } = attachment;
  const isAudio = contentType.startsWith('audio/');
  // Recorded voice messages have a fixed caption and a generated filename.
  const isVoiceNote = isAudio && (
    isVoiceMessage || /^voice-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.m4a$/i.test(fileName)
  );

  let preview;
  if (contentType.startsWith('image/')) {
    preview = <ImageAttachment attachmentId={id} fileName={fileName} />;
  } else if (contentType.startsWith('video/')) {
    preview = <VideoAttachment attachmentId={id} fileName={fileName} />;
  } else if (isAudio) {
    preview = <AudioAttachment attachmentId={id} fileName={fileName} isVoiceNote={isVoiceNote} />;
  } else {
    preview = <FileAttachment attachmentId={id} fileName={fileName} contentType={contentType} />;
  }

  return (
    <YStack gap='$2'>
      {preview}
      {!isVoiceNote && <MessageAttachmentDownload attachment={attachment} />}
    </YStack>
  );
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
