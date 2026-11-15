import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react-native';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActivityIndicator, Alert, FlatList, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useUserContext } from '@/src/contexts/user-context';
import { useCallHistory } from '@/src/hooks/use-call-history';
import { COLORS } from '@/src/lib/constants';
import type { CallHistoryItem } from '@/src/types/call';

export function CallHistoryList() {
  const { user } = useUserContext();
  const history = useCallHistory(user?.id);
  const busy = history.isLoading || !!history.deleting;
  function confirmRemove(call?: CallHistoryItem) {
    Alert.alert(
      call ? '¿Eliminar este registro?' : '¿Eliminar todo el historial?',
      'También se eliminarán los eventos de llamada de tus conversaciones.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void history.remove(call?.id);
          },
        },
      ],
    );
  }
  return (
    <YStack flex={1} bg='$bgApp' accessibilityLabel='Historial de llamadas'>
      <XStack
        items='center'
        justify='space-between'
        px='$4'
        py='$3'
        borderBottomWidth={1}
        borderBottomColor='$border'
      >
        <Text fontSize='$2' color='$textSecondary'>
          Más recientes primero
        </Text>
        <XStack gap='$4'>
          <Pressable
            disabled={busy}
            onPress={history.refresh}
            accessibilityRole='button'
            accessibilityLabel='Actualizar llamadas'
            hitSlop={10}
            style={{ opacity: busy ? 0.4 : 1 }}
          >
            <RefreshCw size={19} color={COLORS['text-secondary']} />
          </Pressable>
          <Pressable
            disabled={busy || history.items.length === 0}
            onPress={() => confirmRemove()}
            accessibilityRole='button'
            accessibilityLabel='Eliminar todo el historial'
            hitSlop={10}
            style={{ opacity: busy || history.items.length === 0 ? 0.4 : 1 }}
          >
            <Trash2 size={19} color={COLORS['text-secondary']} />
          </Pressable>
        </XStack>
      </XStack>
      {(history.error || history.actionError) && (
        <YStack
          mx='$4'
          mt='$3'
          p='$3'
          rounded='$3'
          bg='#fff1f2'
          accessibilityRole='alert'
        >
          <Text color='$red10' fontSize='$2'>
            {history.actionError || 'No se pudo cargar el historial.'}
          </Text>
          {history.error && (
            <Pressable
              disabled={busy}
              onPress={
                history.items.length ? history.loadMore : history.refresh
              }
            >
              <Text color='$accent' py='$2'>
                Reintentar
              </Text>
            </Pressable>
          )}
        </YStack>
      )}
      <FlatList
        data={history.items}
        keyExtractor={(call) => call.id}
        renderItem={({ item, index }) => (
          <>
            {(index === 0 ||
              dayLabel(item.createdAt) !==
                dayLabel(history.items[index - 1].createdAt)) && (
              <Text
                px='$4'
                pt='$4'
                pb='$2'
                color='$textSecondary'
                fontSize='$2'
                fontWeight='600'
              >
                {dayLabel(item.createdAt)}
              </Text>
            )}
            <CallHistoryRow
              call={item}
              userId={user?.id}
              disabled={busy}
              deleting={history.deleting === item.id}
              onDelete={() => confirmRemove(item)}
            />
          </>
        )}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        ListEmptyComponent={
          history.isLoading ? (
            <YStack py='$8'>
              <ActivityIndicator color={COLORS.accent} />
              <Text mt='$3' self='center' color='$textSecondary'>
                Cargando llamadas…
              </Text>
            </YStack>
          ) : !history.error ? (
            <YStack flex={1} items='center' justify='center' px='$6' py='$8'>
              <YStack
                width={72}
                height={72}
                rounded='$10'
                items='center'
                justify='center'
                bg='rgba(84,169,235,0.12)'
                mb='$4'
              >
                <Phone size={30} color={COLORS.accent} />
              </YStack>
              <Text fontSize='$5' fontWeight='600' color='$textPrimary'>
                Aún no hay llamadas
              </Text>
              <Text mt='$2' text='center' color='$textSecondary'>
                Tus llamadas de voz y video aparecerán aquí.
              </Text>
            </YStack>
          ) : null
        }
        ListFooterComponent={
          history.hasMore && history.items.length > 0 ? (
            <Pressable
              disabled={busy}
              onPress={history.loadMore}
              accessibilityRole='button'
              style={{
                alignSelf: 'center',
                padding: 16,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {history.isLoading ? (
                <ActivityIndicator color={COLORS.accent} />
              ) : (
                <Text color='$accent' fontWeight='600'>
                  Cargar más llamadas
                </Text>
              )}
            </Pressable>
          ) : null
        }
      />
    </YStack>
  );
}

export function CallHistoryRow({
  call,
  userId,
  disabled,
  deleting,
  onDelete,
}: {
  call: CallHistoryItem;
  userId?: string;
  disabled?: boolean;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const details = callDetails(call, userId);
  const Icon = call.media === 'video' ? Video : Phone;
  const Direction = details.outgoing ? ArrowUpRight : ArrowDownLeft;
  return (
    <XStack items='center' gap='$3' px='$4' py='$3'>
      <YStack
        width={44}
        height={44}
        rounded='$10'
        bg={details.unsuccessful ? '#fff1f2' : 'rgba(84,169,235,0.12)'}
        items='center'
        justify='center'
      >
        <Text
          color={details.unsuccessful ? '$red10' : '$accent'}
          fontWeight='600'
        >
          {details.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()}
        </Text>
      </YStack>
      <YStack flex={1} minW={0} gap='$1'>
        <Text
          numberOfLines={1}
          color={details.unsuccessful ? '$red10' : '$textPrimary'}
          fontWeight='600'
          fontSize='$3'
        >
          {details.name}
        </Text>
        <XStack items='center' gap='$1'>
          <Direction
            size={14}
            color={details.unsuccessful ? COLORS.danger : '#25a975'}
          />
          <Text color='$textSecondary' fontSize='$2'>
            {details.outgoing ? 'Saliente' : 'Entrante'} · {details.detail}
          </Text>
        </XStack>
      </YStack>
      <YStack items='flex-end' gap='$2'>
        <Text fontSize={11} color='$textSecondary'>
          {format(new Date(call.createdAt), 'HH:mm')}
        </Text>
        <Icon
          size={18}
          color={COLORS['text-secondary']}
          accessibilityLabel={
            call.media === 'video' ? 'Videollamada' : 'Llamada de voz'
          }
        />
      </YStack>
      <Pressable
        disabled={disabled}
        onPress={onDelete}
        accessibilityRole='button'
        accessibilityLabel={`Eliminar llamada con ${details.name}`}
        hitSlop={10}
        style={{ padding: 8, opacity: disabled ? 0.35 : 1 }}
      >
        {deleting ? (
          <ActivityIndicator size='small' color={COLORS.accent} />
        ) : (
          <Trash2 size={17} color={COLORS['text-secondary']} />
        )}
      </Pressable>
    </XStack>
  );
}

function callDetails(call: CallHistoryItem, userId?: string) {
  const outgoing = call.callerId === userId;
  const person = outgoing ? call.callee : call.caller;
  const name = person?.username?.trim() || 'Usuario eliminado';
  const attended =
    call.status === 'ended' && !!(call.acceptedAt || call.connectedAt);
  const durationSeconds =
    call.connectedAt && call.endedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(call.endedAt) - Date.parse(call.connectedAt)) / 1000,
          ),
        )
      : 0;
  const duration = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;
  const status = {
    ringing: 'Llamando',
    accepted: 'Conectando',
    connected: 'En curso',
    missed: outgoing ? 'Sin respuesta' : 'Perdida',
    rejected: 'Rechazada',
    failed: 'Fallida',
    ended: 'Cancelada',
  }[call.status];
  const unsuccessful =
    ['missed', 'rejected', 'failed'].includes(call.status) ||
    (call.status === 'ended' && !attended);
  return {
    outgoing,
    name,
    attended,
    detail: attended ? duration : status,
    unsuccessful,
  };
}

function dayLabel(date: string) {
  const value = new Date(date);
  return isToday(value)
    ? 'Hoy'
    : isYesterday(value)
      ? 'Ayer'
      : format(value, 'd MMMM yyyy', { locale: es });
}
