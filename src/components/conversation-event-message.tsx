import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { Message } from '../types/conversation';

type EventMessage = Pick<Message, 'type' | 'metadata' | 'createdAt'>;

function groupEventText(type: Message['type']) {
  return (
    (
      {
        GROUP_CREATED: 'Grupo creado',
        MEMBER_JOINED: 'Un miembro se unió',
        MEMBER_LEFT: 'Un miembro salió',
        MEMBER_REMOVED: 'Un miembro fue eliminado',
        OWNERSHIP_TRANSFERRED: 'Se transfirió la propiedad',
      } as Record<string, string>
    )[type] ?? 'Evento de conversación'
  );
}

export function ConversationEventMessage({
  message,
  isOwn = false,
}: {
  message: EventMessage;
  isOwn?: boolean;
}) {
  if (message.type !== 'CALL_ACCEPTED' && message.type !== 'CALL_END') {
    return (
      <YStack items='center' py='$2'>
        <Text color='$textSecondary' fontSize='$2'>
          {groupEventText(message.type)} · {format(new Date(message.createdAt), 'HH:mm')}
        </Text>
      </YStack>
    );
  }

  const accepted = message.type === 'CALL_ACCEPTED';
  const video = message.metadata?.media === 'video';
  const Icon = video ? Video : Phone;
  const Direction = isOwn ? ArrowUpRight : ArrowDownLeft;
  const rawSeconds = Number(message.metadata?.durationSeconds ?? 0);
  const seconds = Number.isFinite(rawSeconds) ? Math.max(0, Math.floor(rawSeconds)) : 0;
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const outcome =
    (
      {
        rejected: 'Rechazada',
        missed: isOwn ? 'Sin respuesta' : 'Perdida',
        failed: 'No se pudo conectar',
      } as Record<string, string>
    )[String(message.metadata?.status)] ?? (isOwn ? 'Cancelada' : 'No contestada');
  const iconColor = accepted ? '#25a975' : '#e35d6a';

  return (
    <XStack width='100%' justify={isOwn ? 'flex-end' : 'flex-start'} py='$1'>
      <YStack
        minW={235}
        maxW='85%'
        bg={isOwn ? '$bgBubbleOwn' : '$bgBubbleOther'}
        rounded='$4'
        px='$3'
        pt='$3'
        pb='$2'
        elevation='$1'
      >
        <XStack items='center' gap='$3'>
          <XStack
            width={44}
            height={44}
            rounded='$10'
            items='center'
            justify='center'
            bg={accepted ? 'rgba(37,169,117,0.12)' : 'rgba(227,93,106,0.12)'}
          >
            <Icon size={23} color={iconColor} />
          </XStack>
          <YStack gap='$1' flex={1}>
            <Text color='$textPrimary' fontSize='$3' fontWeight='600'>
              {video ? 'Videollamada' : 'Llamada de voz'}
            </Text>
            <XStack items='center' gap='$1'>
              <Direction size={14} color={iconColor} />
              <Text color='$textSecondary' fontSize='$2'>
                {accepted ? duration : outcome}
              </Text>
            </XStack>
          </YStack>
        </XStack>
        <Text self='flex-end' mt='$1' color='$textSecondary' fontSize={11}>
          {format(new Date(message.createdAt), 'HH:mm hh:mm a')}
        </Text>
      </YStack>
    </XStack>
  );
}
