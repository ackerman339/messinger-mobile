import { useRef, useState } from 'react';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import type { Conversation } from '@/src/types/conversation';
import { FlatList } from 'react-native';
import { Button, Text, XStack } from 'tamagui';
import { GroupDialog } from './group-dialog';
export function GroupManagementDialog({
  group,
  action,
  onClose,
}: {
  group: Conversation;
  action: 'delete' | 'transfer' | 'leave';
  onClose: () => void;
}) {
  const { user } = useUserContext();
  const {
    handleGroupDeleted,
    handleGroupOwnerChanged,
    handleRemoveConversation,
  } = useChatContext();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const member = group.members.find(
    (item) => item.userId === user?.id && !item.softDeletedAt,
  );
  const owner = member?.role === 'OWNER';
  const candidates = group.members.filter(
    (item) => item.userId !== user?.id && !item.softDeletedAt,
  );
  const permitted =
    !group.isDeleted &&
    !group.invitation &&
    (action === 'leave' ? member?.role === 'MEMBER' : owner);
  const title =
    action === 'delete'
      ? 'Eliminar grupo'
      : action === 'transfer'
        ? 'Transferir propiedad'
        : 'Salir del grupo';
  const description =
    action === 'delete'
      ? `¿Eliminar ${group.name}? Los miembros ya no podrán enviar mensajes.`
      : action === 'transfer'
        ? 'Selecciona al miembro que será el nuevo propietario. Tú pasarás a ser miembro.'
        : `¿Salir de ${group.name}? Dejarás de recibir mensajes de este grupo.`;
  async function submit() {
    if (
      pending.current ||
      !permitted ||
      (action === 'transfer' &&
        !candidates.some((item) => item.userId === selected))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await conversationService.deleteGroup({
          conversationId: group.id,
        });
        handleGroupDeleted(group.id);
      } else if (action === 'leave') {
        await conversationService.leaveGroup({ conversationId: group.id });
        handleRemoveConversation(group.id);
      } else {
        await conversationService.transferOwnership({
          conversationId: group.id,
          newOwnerId: selected,
        });
        handleGroupOwnerChanged(group.id, selected);
      }
      onClose();
    } catch {
      setError('No se pudo completar la acción. Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <GroupDialog
      open
      busy={busy}
      title={title}
      description={description}
      onClose={onClose}
    >
      {action === 'transfer' && (
        <FlatList
          style={{ maxHeight: 260, flexGrow: 0 }}
          data={candidates}
          keyExtractor={(item) => item.userId}
          extraData={{ selected, busy }}
          ListEmptyComponent={
            <Text color='$textSecondary'>
              No hay otros miembros disponibles.
            </Text>
          }
          renderItem={({ item }) => (
            <Button
              minH={48}
              mb='$2'
              disabled={busy}
              onPress={() => setSelected(item.userId)}
              accessibilityRole='radio'
              accessibilityLabel={item.username}
              accessibilityState={{ checked: selected === item.userId }}
              bg={selected === item.userId ? '$accent' : '$background'}
              color={selected === item.userId ? 'white' : '$textPrimary'}
            >
              {item.username}
            </Button>
          )}
        />
      )}
      {!!error && (
        <Text accessibilityRole='alert' color='$red10'>
          {error}
        </Text>
      )}
      <XStack gap='$3' justify='flex-end' flexWrap='wrap'>
        <Button disabled={busy} onPress={onClose}>
          Cancelar
        </Button>
        <Button
          minH={48}
          disabled={
            busy || !permitted || (action === 'transfer' && !selected)
          }
          onPress={submit}
          accessibilityRole='button'
          accessibilityLabel='Confirmar acción del grupo'
          bg={action === 'transfer' ? '$accent' : '#ef505d'}
          color='white'
        >
          {busy ? 'Procesando...' : title}
        </Button>
      </XStack>
    </GroupDialog>
  );
}
