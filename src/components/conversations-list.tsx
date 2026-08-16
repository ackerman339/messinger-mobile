import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem } from 'react-native';
import { Avatar, Button, Input, Text, XStack, YStack } from 'tamagui';

import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
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

  const renderItem = useCallback<ListRenderItem<Conversation>>(
    ({ item }) => (
      <ConversationRow
        conversation={item}
        isActive={item.id === activeConversation?.id}
        onSelect={() => handleCurrentConversation(item.id)}
      />
    ),
    [activeConversation?.id, handleCurrentConversation],
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

  const privateConversationMember = conversation.members.find((member) => member.id !== user?.id);

  const title =
    conversation.type === 'GROUP' ? conversation.name : (privateConversationMember?.username ?? '');

  const avatarText = title ? title.slice(0, 2).toUpperCase() : '';

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
      <Avatar circular size='$5' backgroundColor='$accent'>
        <Avatar.Fallback bg='$accent' items='center' justify='center'>
          <Text fontSize='$3' fontWeight='600' color='white'>
            {avatarText}
          </Text>
        </Avatar.Fallback>
      </Avatar>

      <YStack flex={1} minW={0} items='flex-start'>
        {conversation.name && (
          <Text
            numberOfLines={1}
            ellipsizeMode='tail'
            fontSize='$3'
            fontWeight='600'
            color={isActive ? 'white' : '$textPrimary'}
          >
            {conversation.name}
          </Text>
        )}

        <Text
          marginBlockStart='$0.5'
          numberOfLines={1}
          ellipsizeMode='tail'
          fontSize='$3'
          color={isActive ? 'rgba(255,255,255,0.8)' : '$textSecondary'}
        >
          {title}
        </Text>
      </YStack>

      <Text
        self='flex-start'
        paddingBlockStart='$0.5'
        fontSize='$2'
        color={isActive ? 'rgba(255,255,255,0.8)' : '$textSecondary'}
      >
        {format(new Date(conversation.updatedAt), 'HH:mm', {
          locale: es,
        })}
      </Text>
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
