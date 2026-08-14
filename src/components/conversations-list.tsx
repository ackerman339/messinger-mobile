import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar, Button, Input, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { ChatMenu } from './chat-menu';

import type { Conversation } from '@/src/types/conversation';

export function ConversationList() {
  const { conversations, activeConversation, loadingConversations, handleCurrentConversation } =
    useChatContext();

  const conversationsItems = [...conversations.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

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

      <ScrollView
        flex={1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          p: 8,
        }}
      >
        {loadingConversations ? <ListState label='Cargando conversaciones...' /> : null}

        {!loadingConversations && conversations.size === 0 ? (
          <ListState label='No tienes conversaciones aún' />
        ) : (
          conversationsItems.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              isActive={conversation.id === activeConversation?.id}
              key={conversation.id}
              onSelect={() => handleCurrentConversation(conversation.id)}
            />
          ))
        )}
      </ScrollView>
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
        <Avatar.Fallback bg='$accent' items='center' justify={'center'}>
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
    <YStack px='$4' py='$8' items='center'>
      <Text fontSize='$3' color='$textSecondary' text='center'>
        {label}
      </Text>
    </YStack>
  );
}
