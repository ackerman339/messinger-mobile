import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem } from 'react-native';
import { Avatar, Button, Input, Text, XStack, YStack } from 'tamagui';

import { wsClient } from '@/src/clients/websocket-client';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import { WS_SERVER_EVENTS } from '@/src/types/websocket';

import { ChatMenu } from './chat-menu';

import type { Conversation } from '@/src/types/conversation';

export function ConversationList() {
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
  useEffect(() => {
    const unsubscribeNewConversationFrom = wsClient.on(
      WS_SERVER_EVENTS.NEW_MESSAGE,
      async (message) => {
        if (!conversations.has(message.conversation.id)) {
          handleNewConversation(message.conversation);
        }
      },
    );

    const unsubscribeNewConversationTo = wsClient.on(
      WS_SERVER_EVENTS.MESSAGE_SENT,
      async (message) => {
        if (!conversations.has(message.conversation.id)) {
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
  }, [loadingConversations, hasMoreConversations, loadMoreConversations]);

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
  const handleSelect = useCallback(
    async (conversationId: string) => {
      handleCurrentConversation(conversationId);

      await conversationService.resetUnreadMessagesCount({
        conversationId,
      });
    },
    [handleCurrentConversation],
  );

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
      <YStack borderBottomWidth={1} borderBottomColor='$border' px='$4' py='$3'>
        <XStack items='center' gap='$3'>
          <ChatMenu />

          <Input
            flex={1}
            height={40}
            bg='$background'
            borderWidth={0}
            px='$4'
            fontSize='$3'
            color='$textPrimary'
            placeholder='Buscar conversaciones'
            placeholderTextColor='$textSecondary'
          />
        </XStack>
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
  );
}

type ConversationRowProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
};

function ConversationRow({ conversation, isActive, onSelect }: ConversationRowProps) {
  const { user } = useUserContext();
  const { activeConversation } = useChatContext();

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

  const [lastMessageContent, setLastMessageContent] = useState(
    conversation.lastMessage?.content ?? '',
  );

  /**
   * Listen for incoming messages.
   */
  useEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, async (message) => {
      /**
       * Message belongs to the active conversation.
       *
       * Update the last message preview and reset
       * unread messages on the server.
       */
      if (activeConversation?.id === message.conversation.id) {
        setLastMessageContent(message.content);

        await conversationService.resetUnreadMessagesCount({
          conversationId: activeConversation.id,
        });

        return;
      }

      /**
       * Message belongs to this conversation while
       * the user is viewing another conversation.
       */
      if (message.conversation.id === conversation.id) {
        setUnreadMessageCount((previous) => previous + 1);

        setLastMessageContent(message.content);
      }
    });

    /**
     * Listen for messages sent by the current user.
     */
    const unsubscribeMessageSent = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      if (message.conversation.id === conversation.id) {
        setLastMessageContent(message.content);
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeMessageSent();
    };
  }, [activeConversation?.id, conversation.id]);

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
          {lastMessageContent}
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
