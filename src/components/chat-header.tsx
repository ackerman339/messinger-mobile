import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, MoreVertical } from 'lucide-react-native';
import { Avatar, Button, Text, XStack, YStack } from 'tamagui';

import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { COLORS } from '@/src/lib/constants';

export function ChatHeader() {
  const { user } = useUserContext();
  const { activeConversation, unSetCurrentConversation } = useChatContext();

  if (!activeConversation) {
    return null;
  }

  const privateConversationMember = activeConversation.members.find(
    (member) => member.id !== user?.id,
  );

  const title =
    activeConversation.type === 'GROUP'
      ? activeConversation.name
      : (privateConversationMember?.username ?? '');

  return (
    <XStack
      height={64}
      items='center'
      justify='space-between'
      borderBottomWidth={1}
      borderBottomColor='$border'
      bg='$bgApp'
      px='$3'
    >
      <XStack flex={1} minW={0} items='center' gap='$3'>
        <Button
          circular
          size='$4'
          unstyled
          items='center'
          justify='center'
          bg='transparent'
          pressStyle={{
            bg: '$backgroundHover',
          }}
          onPress={unSetCurrentConversation}
          accessibilityLabel='Volver'
        >
          <ArrowLeft size={22} color={COLORS['text-secondary']} />
        </Button>

        <Avatar circular size='$5' backgroundColor='$accent'>
          <Avatar.Fallback bg='$accent' items='center' justify='center'>
            <Text fontSize='$3' fontWeight='600' color='white'>
              {title ? title.slice(0, 2).toUpperCase() : ''}
            </Text>
          </Avatar.Fallback>
        </Avatar>

        <YStack flex={1} minW={0}>
          <Text
            numberOfLines={1}
            ellipsizeMode='tail'
            fontSize='$4'
            fontWeight='600'
            color='$textPrimary'
          >
            {title}
          </Text>

          {activeConversation.type === 'PRIVATE' && privateConversationMember?.lastSeenAt ? (
            <Text numberOfLines={1} ellipsizeMode='tail' fontSize='$2' color='$textSecondary'>
              Última vez:{' '}
              {format(new Date(privateConversationMember.lastSeenAt), "d 'de' MMMM yyyy HH:mm a", {
                locale: es,
              })}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      <Button
        circular
        size='$4'
        unstyled
        items='center'
        justify='center'
        bg='transparent'
        pressStyle={{
          bg: '$backgroundHover',
        }}
        accessibilityLabel='Más opciones'
        onPress={() => {}}
      >
        <MoreVertical size={22} color={COLORS['text-secondary']} />
      </Button>
    </XStack>
  );
}
