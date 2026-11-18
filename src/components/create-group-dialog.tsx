import { useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Button, Input, Text } from 'tamagui';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { conversationService } from '@/src/services/conversation';
import { groupConversation } from '@/src/services/groups';
import { GroupDialog } from './group-dialog';

export function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useUserContext();
  const {
    handleNewConversation,
    handleCurrentConversation,
    handleReceiverId,
  } = useChatContext();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function create() {
    if (pending.current || !name.trim() || !user) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await conversationService.createGroup({
        name: name.trim(),
        members: [],
      });
      handleNewConversation(
        groupConversation(result.id, result.name || name.trim(), [
          {
            userId: user.id,
            username: user.username,
            lastSeenAt: null,
            unreadCount: 0,
            role: 'OWNER',
          },
        ]),
      );
      handleReceiverId('');
      handleCurrentConversation(result.id);
      setName('');
      onOpenChange(false);
    } catch {
      setError('No se pudo crear el grupo. Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <GroupDialog
      open={open}
      busy={busy}
      onClose={() => {
        onOpenChange(false);
        setName('');
        setError('');
      }}
      title='Crear nuevo grupo'
      description='Elige un nombre. Después podrás invitar personas desde el menú del grupo.'
    >
      <Text color='$textPrimary' fontSize='$3'>
        Nombre del grupo
      </Text>
      <Input
        autoFocus={open}
        accessibilityLabel='Nombre del grupo'
        value={name}
        onChangeText={setName}
        maxLength={100}
        disabled={busy}
        onSubmitEditing={create}
        returnKeyType='done'
        color='$textPrimary'
        placeholderTextColor='$textSecondary'
        placeholder='Nombre del grupo'
      />
      {!!error && (
        <Text accessibilityRole='alert' color='$red10' fontSize='$3'>
          {error}
        </Text>
      )}
      <Button
        height={48}
        bg='$accent'
        color='white'
        disabled={busy || !name.trim()}
        opacity={busy || !name.trim() ? 0.4 : 1}
        onPress={create}
        accessibilityRole='button'
        accessibilityLabel='Crear grupo'
      >
        {busy ? <ActivityIndicator color='white' /> : 'Crear grupo'}
      </Button>
    </GroupDialog>
  );
}
