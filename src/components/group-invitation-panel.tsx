import { Users } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import { useChatContext } from '@/src/contexts/chat-context';
import { COLORS } from '@/src/lib/constants';
import {
  getAllConversations,
  groupError,
  groupService,
} from '@/src/services/groups';

export function GroupInvitationPanel() {
  const {
    activeConversation,
    handleNewConversation,
    handleRemoveConversation,
  } = useChatContext();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (!activeConversation?.invitation) return null;
  const conversation = activeConversation;
  async function respond(action: 'accept' | 'reject') {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    setError('');
    try {
      if (action === 'reject') {
        await groupService.reject(conversation.id);
        handleRemoveConversation(conversation.id);
      } else {
        if (!accepted) {
          await groupService.accept(conversation.id);
          setAccepted(true);
        }
        const group = (await getAllConversations()).find(
          (item) => item.id === conversation.id,
        );
        if (!group)
          throw new Error(
            'No se pudo cargar el grupo. Inténtalo de nuevo.',
          );
        handleNewConversation(group);
      }
    } catch (error) {
      setError(groupError(error));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS['bg-chat'] }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <YStack bg='$bgApp' p='$5' rounded='$4' gap='$4' items='center'>
        <Users size={40} color={COLORS.accent} />
        <Text
          accessibilityRole='header'
          fontSize='$5'
          color='$textPrimary'
          fontWeight='600'
          text='center'
        >
          Invitación a {conversation.name}
        </Text>
        <Text fontSize='$3' color='$textSecondary' text='center'>
          {accepted
            ? 'Ya aceptaste la invitación. Abre el grupo para comenzar.'
            : 'Te han invitado a este grupo. Acepta para ver la conversación y enviar mensajes.'}
        </Text>
        {!!error && (
          <Text accessibilityRole='alert' color='$red10' fontSize='$3'>
            {error}
          </Text>
        )}
        <XStack gap='$3' width='100%' flexWrap='wrap' justify='center'>
          {!accepted && (
            <Button
              minH={48}
              disabled={!!busy}
              onPress={() => respond('reject')}
              accessibilityRole='button'
              accessibilityLabel='Rechazar invitación'
            >
              {busy === 'reject' ? 'Rechazando...' : 'Rechazar'}
            </Button>
          )}
          <Button
            minH={48}
            bg='$accent'
            color='white'
            disabled={!!busy}
            onPress={() => respond('accept')}
            accessibilityRole='button'
            accessibilityLabel={
              accepted ? 'Abrir grupo' : 'Aceptar invitación'
            }
          >
            {busy === 'accept'
              ? 'Cargando...'
              : accepted
                ? 'Abrir grupo'
                : 'Aceptar'}
          </Button>
        </XStack>
      </YStack>
    </ScrollView>
  );
}
