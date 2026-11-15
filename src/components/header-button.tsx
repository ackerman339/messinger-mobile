import { Eraser, MoreVertical, Radio } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { Button, Popover, Text, YStack } from 'tamagui';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import { COLORS } from '@/src/lib/constants';

export function HeaderButton() {
  const { user } = useUserContext();
  const { activeConversation, handleEmptyChat } = useChatContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const participant = activeConversation?.members.find(
    (member) => member.userId !== user?.id,
  );

  async function handleRequestConnection() {
    if (
      pending.current ||
      !user ||
      !participant ||
      activeConversation?.type !== 'PRIVATE'
    )
      return;
    pending.current = true;
    setBusy(true);
    setOpen(false);
    try {
      await conversationService.requestUserConnection({
        senderName: user.username || 'Usuario',
        conversationId: activeConversation.id,
        targetUserId: participant.userId,
      });
      Alert.alert(
        'Solicitud enviada',
        'Se le notificó que necesitas que se conecte.',
      );
    } catch {
      Alert.alert('No se pudo enviar la solicitud', 'Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function handleEmptyMessages() {
    const conversationId = activeConversation?.id;
    if (pending.current || !conversationId) return;
    pending.current = true;
    setBusy(true);
    try {
      await conversationService.emptyMessages({ conversationId });
      handleEmptyChat(conversationId);
    } catch {
      Alert.alert('No se pudo vaciar el chat', 'Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function confirmEmptyMessages() {
    setOpen(false);
    Alert.alert(
      '¿Vaciar chat?',
      'Se ocultarán los mensajes y eventos de esta conversación solo para ti.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: () => {
            void handleEmptyMessages();
          },
        },
      ],
    );
  }

  if (!activeConversation) return null;
  return (
    <Popover open={open} onOpenChange={setOpen} placement='bottom-end'>
      <Popover.Trigger asChild>
        <Button
          circular
          size='$4'
          unstyled
          items='center'
          justify='center'
          bg='transparent'
          disabled={busy}
          pressStyle={{ bg: '$backgroundHover' }}
          accessibilityRole='button'
          accessibilityLabel='Más opciones'
        >
          {busy ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <MoreVertical size={22} color={COLORS['text-secondary']} />
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        width={250}
        p='$1'
        borderWidth={1}
        borderColor='$border'
        bg='$bgApp'
        elevation='$4'
      >
        <YStack>
          {activeConversation.type === 'PRIVATE' && participant && (
            <Button
              unstyled
              minH={44}
              px='$3'
              py='$2'
              gap='$3'
              flexDirection='row'
              items='center'
              disabled={busy}
              onPress={handleRequestConnection}
              accessibilityRole='button'
              accessibilityLabel='Solicitar que se conecte'
              pressStyle={{ bg: '$backgroundHover' }}
            >
              <Radio size={18} color={COLORS['text-primary']} />
              <Text flex={1} color='$textPrimary' fontSize='$3'>
                Solicitar que se conecte
              </Text>
            </Button>
          )}
          <Button
            unstyled
            minH={44}
            px='$3'
            py='$2'
            gap='$3'
            flexDirection='row'
            items='center'
            disabled={busy}
            onPress={confirmEmptyMessages}
            accessibilityRole='button'
            accessibilityLabel='Vaciar chat'
            pressStyle={{ bg: '$backgroundHover' }}
          >
            <Eraser size={18} color={COLORS.danger} />
            <Text flex={1} color='$red10' fontSize='$3'>
              Vaciar chat
            </Text>
          </Button>
        </YStack>
      </Popover.Content>
    </Popover>
  );
}
