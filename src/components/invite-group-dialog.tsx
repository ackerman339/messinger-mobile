import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { useUserContext } from '@/src/contexts/user-context';
import { COLORS } from '@/src/lib/constants';
import {
  getAllConversations,
  inviteCandidates,
  groupError,
  groupService,
} from '@/src/services/groups';
import type { Conversation, Member } from '@/src/types/conversation';
import { GroupDialog } from './group-dialog';

export function InviteGroupDialog({
  group,
  onClose,
}: {
  group: Conversation;
  onClose: () => void;
}) {
  const { user } = useUserContext();
  const [contacts, setContacts] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    getAllConversations()
      .then((conversations) => {
        if (!cancelled)
          setContacts(
            inviteCandidates(conversations, group, user?.id || ''),
          );
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los contactos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [group, user?.id, retry]);
  async function invite() {
    if (pending.current || !selected.length) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const results = await Promise.allSettled(
      selected.map((id) => groupService.invite(group.id, id)),
    );
    if (!mounted.current) return;
    const successes = selected.filter(
      (_, i) => results[i].status === 'fulfilled',
    );
    const failures = selected.filter(
      (_, i) => results[i].status === 'rejected',
    );
    setSent((previous) => [...previous, ...successes]);
    setSelected(failures);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') setError(groupError(failed.reason));
    pending.current = false;
    setBusy(false);
  }
  const visible = contacts.filter((contact) =>
    contact.username
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <GroupDialog
      open
      busy={busy}
      onClose={onClose}
      title='Invitar personas'
      description={`Selecciona las personas con las que has conversado para invitarlas a ${group.name}.`}
    >
      <Input
        accessibilityLabel='Buscar personas'
        placeholder='Buscar personas'
        value={query}
        onChangeText={setQuery}
        color='$textPrimary'
        placeholderTextColor='$textSecondary'
      />
      {loading ? (
        <ActivityIndicator
          accessibilityLabel='Cargando contactos'
          color={COLORS.accent}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.userId}
          extraData={{ selected, sent, busy }}
          keyboardShouldPersistTaps='handled'
          style={{ maxHeight: 300, flexGrow: 0 }}
          ListEmptyComponent={
            <Text fontSize='$3' color='$textSecondary'>
              {contacts.length
                ? 'No hay coincidencias.'
                : 'No hay personas disponibles para invitar.'}
            </Text>
          }
          renderItem={({ item }) => {
            const checked =
              selected.includes(item.userId) || sent.includes(item.userId);
            const disabled = busy || sent.includes(item.userId);
            return (
              <Pressable
                onPress={() =>
                  setSelected((previous) =>
                    previous.includes(item.userId)
                      ? previous.filter((id) => id !== item.userId)
                      : [...previous, item.userId],
                  )
                }
                disabled={disabled}
                accessibilityRole='checkbox'
                accessibilityLabel={item.username}
                accessibilityState={{ checked, disabled }}
              >
                <XStack minH={52} items='center' gap='$3' py='$2'>
                  <YStack
                    width={24}
                    height={24}
                    rounded={4}
                    borderWidth={1}
                    borderColor={checked ? '$accent' : '$border'}
                    bg={checked ? '$accent' : 'transparent'}
                    items='center'
                    justify='center'
                  >
                    {checked && <Check size={18} color='white' />}
                  </YStack>
                  <Text
                    flex={1}
                    color='$textPrimary'
                    fontSize='$3'
                    numberOfLines={1}
                  >
                    {item.username}
                  </Text>
                  {sent.includes(item.userId) && (
                    <Text color='$textSecondary' fontSize='$1'>
                      Enviada
                    </Text>
                  )}
                </XStack>
              </Pressable>
            );
          }}
        />
      )}
      {!!error && (
        <Text accessibilityRole='alert' color='$red10' fontSize='$3'>
          {error}
        </Text>
      )}
      {!!error && !contacts.length && (
        <Button
          onPress={() => {
            setError('');
            setLoading(true);
            setRetry((value) => value + 1);
          }}
          accessibilityLabel='Reintentar carga'
        >
          Reintentar
        </Button>
      )}
      {sent.length > 0 && (
        <Text
          accessibilityLiveRegion='polite'
          color='$textSecondary'
          fontSize='$3'
        >
          {sent.length} invitaciones enviadas.
        </Text>
      )}
      <Button
        height={48}
        bg='$accent'
        color='white'
        disabled={loading || busy || !selected.length}
        opacity={loading || busy || !selected.length ? 0.4 : 1}
        onPress={invite}
        accessibilityRole='button'
        accessibilityLabel='Enviar invitaciones'
      >
        {busy
          ? 'Enviando...'
          : `Invitar${selected.length ? ` (${selected.length})` : ''}`}
      </Button>
    </GroupDialog>
  );
}
