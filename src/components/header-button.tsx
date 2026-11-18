import {
  Eraser,
  MoreVertical,
  Radio,
  UserPlus,
  Trash2,
  LogOut,
  ArrowRightLeft,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { Button, Popover, Separator, Text, YStack } from 'tamagui';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import { InviteGroupDialog } from './invite-group-dialog';
import { GroupManagementDialog } from './group-management-dialog';
import { COLORS } from '@/src/lib/constants';

export function HeaderButton() {
  const { user } = useUserContext();
  const { activeConversation, handleEmptyChat } = useChatContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<
    'delete' | 'transfer' | 'leave' | null
  >(null);
  const pending = useRef(false);
  const groupMember = activeConversation?.members.find(
    (member) => member.userId === user?.id && !member.softDeletedAt,
  );
  const isActiveGroup =
    activeConversation?.type === 'GROUP' &&
    !activeConversation.invitation &&
    !activeConversation.isDeleted;
  const isOwner = groupMember?.role === 'OWNER';
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

  function renderGroupAction(action: 'delete' | 'transfer' | 'leave') {
    const Icon =
      action === 'delete'
        ? Trash2
        : action === 'transfer'
          ? ArrowRightLeft
          : LogOut;
    return (
      <Button
        key={action}
        unstyled
        width='100%'
        minH={44}
        px='$3'
        py='$2'
        gap='$3'
        flexDirection='row'
        items='center'
        disabled={busy}
        onPress={() => {
          setOpen(false);
          setGroupAction(action);
        }}
        accessibilityRole='button'
        accessibilityLabel={
          action === 'delete'
            ? 'Eliminar grupo'
            : action === 'transfer'
              ? 'Transferir propiedad'
              : 'Salir del grupo'
        }
        pressStyle={{ bg: '$backgroundHover' }}
      >
        <Icon
          size={18}
          color={
            action === 'transfer' ? COLORS['text-primary'] : COLORS.danger
          }
        />
        <Text
          shrink={1}
          color={action === 'transfer' ? '$textPrimary' : '#ef505d'}
          fontSize='$3'
        >
          {action === 'delete'
            ? 'Eliminar grupo'
            : action === 'transfer'
              ? 'Transferir propiedad'
              : 'Salir del grupo'}
        </Text>
      </Button>
    );
  }

  if (!activeConversation) return null;
  return (
    <>
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
            {activeConversation.type === 'GROUP' &&
              !activeConversation.isDeleted &&
              !activeConversation.invitation &&
              activeConversation.members.some(
                (member) =>
                  member.userId === user?.id && member.role === 'OWNER',
              ) && (
                <Button
                  unstyled
                  width='100%'
                  minH={44}
                  px='$3'
                  py='$2'
                  gap='$3'
                  flexDirection='row'
                  items='center'
                  onPress={() => {
                    setOpen(false);
                    setInviteOpen(true);
                  }}
                  accessibilityRole='button'
                  accessibilityLabel='Invitar personas'
                  pressStyle={{ bg: '$backgroundHover' }}
                >
                  <UserPlus size={18} color={COLORS['text-primary']} />
                  <Text shrink={1} color='$textPrimary' fontSize='$3'>
                    Invitar personas
                  </Text>
                </Button>
              )}
            {isActiveGroup && isOwner && renderGroupAction('transfer')}
            {activeConversation.type === 'PRIVATE' && participant && (
              <Button
                unstyled
                width='100%'
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
                <Text shrink={1} color='$textPrimary' fontSize='$3'>
                  Solicitar que se conecte
                </Text>
              </Button>
            )}
            {((isActiveGroup && isOwner) ||
              (activeConversation.type === 'PRIVATE' && participant)) && (
              <Separator my='$1' bg='$border' />
            )}
            <Button
              unstyled
              width='100%'
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
              <Text shrink={1} color='#ef505d' fontSize='$3'>
                Vaciar chat
              </Text>
            </Button>
            {isActiveGroup &&
              (isOwner
                ? renderGroupAction('delete')
                : groupMember?.role === 'MEMBER'
                  ? renderGroupAction('leave')
                  : null)}
          </YStack>
        </Popover.Content>
      </Popover>
      {groupAction && isActiveGroup && (
        <GroupManagementDialog
          key={activeConversation.id}
          group={activeConversation}
          action={groupAction}
          onClose={() => setGroupAction(null)}
        />
      )}
      {inviteOpen &&
        !activeConversation.isDeleted &&
        activeConversation.type === 'GROUP' &&
        !activeConversation.invitation && (
          <InviteGroupDialog
            key={activeConversation.id}
            group={activeConversation}
            onClose={() => setInviteOpen(false)}
          />
        )}
    </>
  );
}
