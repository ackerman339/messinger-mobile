import { COLORS } from '@/src/lib/constants';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessagesSquare, Phone } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, type ListRenderItem } from 'react-native';
import { Avatar, Button, Input, Text, XStack, YStack } from 'tamagui';
import { CallHistoryList } from './call-history-list';

import { wsClient } from '@/src/clients/websocket-client';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import { WS_SERVER_EVENTS } from '@/src/types/websocket';

import { ChatMenu } from './chat-menu';

import type { Conversation, ConversationEvent, Message } from '@/src/types/conversation';

export function ConversationList() {
  const [activeTab, setActiveTab] = useState<'chats' | 'calls'>('chats');
  const {
    conversations,
    activeConversation,
    loadingConversations,
    hasMoreConversations,
    handleCurrentConversation,
    loadMoreConversations,
    handleNewConversation,
  } = useChatContext();

  /**
   * Prevent multiple pagination requests while
   * the end of the list remains visible.
   */
  const loadingMoreRef = useRef(false);

  const conversationsItems = Array.from(conversations.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  /**
   * Listen for messages that belong to conversations
   * that are not currently present in the conversation list.
   *
   * Same behavior as the web implementation.
   */
  useLayoutEffect(() => {
    const unsubscribeNewConversationFrom = wsClient.on(
      WS_SERVER_EVENTS.NEW_MESSAGE,
      async (message) => {
        if (message.conversation && !conversations.has(message.conversation.id)) {
          handleNewConversation(message.conversation);
        }
      },
    );

    const unsubscribeNewConversationTo = wsClient.on(
      WS_SERVER_EVENTS.MESSAGE_SENT,
      async (message) => {
        if (message.conversation && !conversations.has(message.conversation.id)) {
          handleNewConversation(message.conversation);
        }
      },
    );

    return () => {
      unsubscribeNewConversationFrom();
      unsubscribeNewConversationTo();
    };
  }, [conversations, handleNewConversation]);

  /**
   * Load the next page when the user reaches
   * the end of the conversation list.
   */
  const handleEndReached = useCallback(() => {
    if (activeTab !== 'chats') return;
    if (loadingConversations) {
      return;
    }

    if (!hasMoreConversations) {
      return;
    }

    if (loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;

    loadMoreConversations();
  }, [activeTab, loadingConversations, hasMoreConversations, loadMoreConversations]);

  /**
   * Unlock pagination after the request finishes.
   */
  useEffect(() => {
    if (!loadingConversations) {
      loadingMoreRef.current = false;
    }
  }, [loadingConversations]);

  /**
   * Select conversation and reset unread messages.
   */
  const handleSelect = handleCurrentConversation;

  const renderItem = useCallback<ListRenderItem<Conversation>>(
    ({ item }) => (
      <ConversationRow
        conversation={item}
        isActive={item.id === activeConversation?.id}
        onSelect={() => handleSelect(item.id)}
      />
    ),
    [activeConversation?.id, handleSelect],
  );

  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  return (
    <YStack flex={1} bg='$bgSidebar'>
      <XStack
        height={64}
        borderBottomWidth={1}
        borderBottomColor='$border'
        px='$4'
        gap='$3'
        items='center'
      >
        <ChatMenu />
        <Text fontSize='$5' fontWeight='600' color='$textPrimary'>
          Pulse
        </Text>
      </XStack>
      <XStack
        accessibilityRole='tablist'
        accessibilityLabel='Chats y llamadas'
        borderBottomWidth={1}
        borderBottomColor='$border'
        px='$3'
      >
        {(['chats', 'calls'] as const).map((tab) => {
          const selected = activeTab === tab;
          const Icon = tab === 'chats' ? MessagesSquare : Phone;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              accessibilityRole='tab'
              accessibilityState={{ selected }}
              accessibilityLabel={tab === 'chats' ? 'Chats' : 'Llamadas'}
              style={{
                flex: 1,
                borderBottomWidth: 2,
                borderBottomColor: selected ? COLORS.accent : 'transparent',
              }}
            >
              <XStack py='$3' items='center' justify='center' gap='$2'>
                <Icon size={18} color={selected ? COLORS.accent : COLORS['text-secondary']} />
                <Text
                  fontSize='$3'
                  fontWeight='600'
                  color={selected ? '$accent' : '$textSecondary'}
                >
                  {tab === 'chats' ? 'Chats' : 'Llamadas'}
                </Text>
              </XStack>
            </Pressable>
          );
        })}
      </XStack>
      <YStack flex={1} display={activeTab === 'chats' ? 'flex' : 'none'}>
        <YStack px='$4' py='$3'>
          <Input
            height={40}
            bg='$background'
            borderWidth={0}
            px='$4'
            fontSize='$3'
            color='$textPrimary'
            placeholder='Buscar conversaciones'
            placeholderTextColor='$textSecondary'
            accessibilityLabel='Buscar conversaciones'
          />
        </YStack>
        {loadingConversations && conversationsItems.length === 0 ? (
          <ListState label='Cargando conversaciones...' />
        ) : !loadingConversations && conversationsItems.length === 0 ? (
          <ListState label='No tienes conversaciones aún' />
        ) : (
          <FlatList
            data={conversationsItems}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 8,
            }}
            /**
             * Trigger pagination when the user gets
             * close to the end of the list.
             */
            onEndReached={handleEndReached}
            /**
             * Trigger pagination when the user is within
             * 20% of the end of the list.
             */
            onEndReachedThreshold={0.2}
            /**
             * Show a loading indicator below the
             * existing conversations while loading
             * the next page.
             */
            ListFooterComponent={
              loadingConversations && conversationsItems.length > 0 ? (
                <YStack py='$3' items='center'>
                  <ActivityIndicator />
                </YStack>
              ) : null
            }
          />
        )}
      </YStack>
      {activeTab === 'calls' && <CallHistoryList />}
      <Text color='red' fontSize='$1'>
        APK version 1.6.0
      </Text>
    </YStack>
  );
}

function getLastMessageContent(
  message?: Pick<Message, 'type' | 'metadata'> & { content?: string },
) {
  if (message?.type === 'CALL_ACCEPTED' || message?.type === 'CALL_END') {
    return message.metadata?.media === 'video' ? 'Videollamada' : 'Llamada de voz';
  }
  if (message?.type === 'GROUP_CALL_STARTED' || message?.type === 'GROUP_CALL_ENDED') {
    const type = message.metadata?.media === 'video' ? 'Videollamada grupal' : 'Llamada grupal';
    return message.type === 'GROUP_CALL_STARTED' ? type : `${type} finalizada`;
  }
  return message?.content ?? '';
}

type ConversationRowProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
};

function ConversationRow({ conversation, isActive, onSelect }: ConversationRowProps) {
  const { user } = useUserContext();
  const { activeConversation, emptiedConversation } = useChatContext();

  const privateConversationMember = conversation.members.find(
    (member) => member.userId !== user?.id,
  );

  const privateConversationUser = conversation.members.find((member) => member.userId === user?.id);

  const title =
    conversation.type === 'GROUP'
      ? conversation?.name
      : privateConversationMember?.username || 'Usuario Eliminado';

  const avatarText = title ? title.slice(0, 2).toUpperCase() : '';

  const [unreadMessageCount, setUnreadMessageCount] = useState(
    privateConversationUser?.unreadCount ?? 0,
  );

  const lastEntryRef = useRef<Pick<Message, 'type' | 'metadata'> | undefined>(
    conversation.lastMessage,
  );

  const [lastMessageContent, setLastMessageContent] = useState(
    getLastMessageContent(conversation.lastMessage),
  );

  useEffect(() => {
    if (emptiedConversation?.id !== conversation.id) return;
    lastEntryRef.current = undefined;
    setLastMessageContent('');
    setUnreadMessageCount(0);
  }, [emptiedConversation, conversation.id]);

  /**
   * Listen for incoming messages.
   */
  useLayoutEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      if ((message.conversation?.id ?? message.conversationId) !== conversation.id) return;
      if (activeConversation?.id !== conversation.id) setUnreadMessageCount((previous) => previous + 1);
      lastEntryRef.current = message;
      setLastMessageContent(getLastMessageContent(message));
    });

    const unsubscribeMessageSent = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      if ((message.conversation?.id ?? message.conversationId) === conversation.id) {
        lastEntryRef.current = message;
        setLastMessageContent(getLastMessageContent(message));
      }
    });

    function handleCallEvent({ conversationEvent }: { conversationEvent?: ConversationEvent }) {
      if (!conversationEvent || conversationEvent.conversationId !== conversation.id) return;
      lastEntryRef.current = conversationEvent;
      setLastMessageContent(getLastMessageContent(conversationEvent));
    }
    const unsubscribeCallEnd = wsClient.on('CALL_END', handleCallEvent);
    const offGroupStarted = wsClient.on('GROUP_CALL_STARTED', handleCallEvent);
    const offGroupEnded = wsClient.on('GROUP_CALL_ENDED', handleCallEvent);
    const unsubscribeCallReject = wsClient.on('CALL_REJECT', handleCallEvent);

    const unsubscribeHistoryDeleted = wsClient.on('CALL_HISTORY_DELETED', async ({ callId }) => {
      const entry = lastEntryRef.current;
      if (!entry || (entry.type !== 'CALL_ACCEPTED' && entry.type !== 'CALL_END')) return;
      if (callId && entry.metadata?.callId !== callId) return;
      try {
        const result = await conversationService.getMessages(conversation.id, {
          cursor: null,
          limit: 1,
        });
        if (lastEntryRef.current !== entry) return;
        lastEntryRef.current = result.page[0];
        setLastMessageContent(getLastMessageContent(result.page[0]));
      } catch {
        // The next bootstrap will refresh the preview if the connection is unavailable.
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeMessageSent();
      unsubscribeHistoryDeleted();
      unsubscribeCallEnd();
      offGroupStarted();
      offGroupEnded();
      unsubscribeCallReject();
    };
  }, [activeConversation, conversation.id]);

  /**
   * Reset local unread count when this conversation
   * becomes active.
   */
  useEffect(() => {
    if (activeConversation?.id !== conversation.id) {
      return;
    }

    setUnreadMessageCount(0);
  }, [activeConversation?.id, conversation.id]);

  return (
    <Button
      unstyled
      width='100%'
      flexDirection='row'
      items='center'
      gap='$3'
      px='$3'
      py='$2.5'
      bg={isActive ? '$accent' : 'transparent'}
      pressStyle={{
        bg: isActive ? '$accent' : '$backgroundHover',
      }}
      onPress={onSelect}
    >
      {/* Avatar */}
      <Avatar circular size='$5' backgroundColor='$accent'>
        <Avatar.Fallback bg='$accent' items='center' justify='center'>
          <Text fontSize='$3' fontWeight='600' color='white'>
            {avatarText}
          </Text>
        </Avatar.Fallback>
      </Avatar>

      {/* Conversation information */}
      <YStack flex={1} minW={0} items='flex-start'>
        <Text
          numberOfLines={1}
          ellipsizeMode='tail'
          fontSize='$3'
          fontWeight='600'
          color={isActive ? 'white' : '$textPrimary'}
          width='100%'
        >
          {title}
        </Text>

        <Text
          marginBlockStart='$0.5'
          numberOfLines={1}
          ellipsizeMode='tail'
          fontSize='$3'
          color={
            isActive
              ? 'rgba(255,255,255,0.8)'
              : unreadMessageCount > 0
                ? '$accent'
                : '$textSecondary'
          }
          width='100%'
        >
          {conversation.isDeleted
            ? 'Este grupo fue eliminado'
            : conversation.invitation
              ? 'Invitación pendiente'
              : lastMessageContent}
        </Text>
      </YStack>

      {/* Time + unread count */}
      <YStack items='flex-end' self='flex-start' gap='$1'>
        <Text fontSize='$2' color={isActive ? 'rgba(255,255,255,0.8)' : '$textSecondary'}>
          {format(new Date(conversation.updatedAt), 'HH:mm', {
            locale: es,
          })}
        </Text>

        {unreadMessageCount > 0 && (
          <YStack
            width={24}
            height={24}
            bg='$accent'
            items='center'
            justify='center'
            style={{
              borderRadius: 999,
            }}
          >
            <Text fontSize={12} fontWeight='700' color='white'>
              {unreadMessageCount}
            </Text>
          </YStack>
        )}
      </YStack>
    </Button>
  );
}

function ListState({ label }: { label: string }) {
  return (
    <YStack flex={1} px='$4' py='$8' items='center' justify='center'>
      <Text fontSize='$3' color='$textSecondary' text='center'>
        {label}
      </Text>
    </YStack>
  );
}
