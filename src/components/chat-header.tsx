import { GroupCallButtons } from '@/src/group-calls/group-call-controls';
import { HeaderButton } from './header-button';
import { ArrowLeft } from 'lucide-react-native';
import { useLayoutEffect, useState } from 'react';
import { Avatar, Button, Text, XStack, YStack } from 'tamagui';

import { CallButtons } from '@/src/calls/componentes/call-buttons';
import { wsClient } from '@/src/clients/websocket-client';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { COLORS } from '@/src/lib/constants';
import { formatLastSeen } from '@/src/lib/utils';

import { WS_SERVER_EVENTS } from '@/src/types/websocket';

type Presence = { online: boolean; lastSeenAt: Date | null };

export function ChatHeader() {
  const { user } = useUserContext();
  const { activeConversation, unSetCurrentConversation } =
    useChatContext();

  const [presence, setPresence] = useState<Presence>({
    online: false,
    lastSeenAt: null,
  });

  useLayoutEffect(() => {
    if (!activeConversation) {
      return;
    }

    if (activeConversation.type !== 'PRIVATE') {
      return;
    }

    const unsubscribeUserPresenceOnline = wsClient.on(
      WS_SERVER_EVENTS.PRESENCE_ONLINE,
      async (message) => {
        setPresence(message);
      },
    );

    const unsubscribeUserPresenceOffline = wsClient.on(
      WS_SERVER_EVENTS.PRESENCE_OFFLINE,
      async (message) => {
        setPresence(message);
      },
    );

    const privateConversationMember = activeConversation.members.filter(
      (member) => member.userId !== user?.id,
    )[0];

    wsClient.emit('PRESENCE_ONLINE', {
      receiverId: privateConversationMember.userId,
    });

    return () => {
      unsubscribeUserPresenceOnline();
      unsubscribeUserPresenceOffline();
    };
  }, [activeConversation, user]);

  if (!activeConversation) {
    return null;
  }

  const privateConversationMember = activeConversation.members.filter(
    (member) => member.userId !== user?.id,
  )[0];

  const title =
    activeConversation.type === 'GROUP'
      ? activeConversation?.name
      : privateConversationMember?.username || 'Usuario Eliminado';

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
      <XStack flex={1} items='center' gap='$2'>
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

        <Avatar circular size='$4' backgroundColor='$accent'>
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
            fontSize='$3'
            fontWeight='600'
            color='$textPrimary'
          >
            {title}
          </Text>

          {activeConversation.type === 'PRIVATE' && presence.online ? (
            <Text
              numberOfLines={1}
              ellipsizeMode='tail'
              fontSize='$1'
              color='$textSecondary'
            >
              En linea
            </Text>
          ) : (
            presence.lastSeenAt && (
              <Text
                numberOfLines={1}
                ellipsizeMode='tail'
                fontSize='$1'
                color='$textSecondary'
              >
                Última vez: {formatLastSeen(presence.lastSeenAt)}
              </Text>
            )
          )}
        </YStack>
      </XStack>

      <XStack items='center' gap='$1'>
        {activeConversation.type === 'PRIVATE' &&
          privateConversationMember?.userId && (
            <CallButtons
              participantId={privateConversationMember.userId}
            />
          )}
        <GroupCallButtons />
        {!activeConversation.invitation && (
          <HeaderButton key={activeConversation.id} />
        )}
      </XStack>
    </XStack>
  );
}
