import { format } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  Video,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { Message } from '../types/conversation';

type EventMessage = Pick<
  Message,
  'type' | 'metadata' | 'createdAt' | 'actorId' | 'targetUserId'
>;
type EventMember = { userId: string; username: string };

function groupEventText(message: EventMessage, members: EventMember[]) {
  const id = message.targetUserId || message.actorId;
  const name = members.find((member) => member.userId === id)?.username;
  const target = name || 'Un miembro';
  switch (message.type) {
    case 'GROUP_CREATED':
      return name ? `${name} creó el grupo` : 'Grupo creado';
    case 'MEMBER_JOINED':
      return `${target} se unió al grupo`;
    case 'MEMBER_LEFT':
      return `${target} dejó el grupo`;
    case 'MEMBER_REMOVED':
      return `${target} fue eliminado del grupo`;
    case 'OWNERSHIP_TRANSFERRED':
      return name
        ? `${name} es el nuevo propietario del grupo`
        : 'Se transfirió la propiedad';
    default:
      return 'Evento de conversación';
  }
}

export function ConversationEventMessage({
  message,
  isOwn = false,
  members = [],
}: {
  message: EventMessage;
  isOwn?: boolean;
  members?: EventMember[];
}) {
  if (message.type !== 'CALL_ACCEPTED' && message.type !== 'CALL_END') {
    return (
      <YStack items='center' py='$2'>
        <Text color='$textSecondary' fontSize='$2'>
          {groupEventText(message, members)} ·{' '}
          {format(new Date(message.createdAt), 'HH:mm')}
        </Text>
      </YStack>
    );
  }

  const accepted = message.type === 'CALL_ACCEPTED';
  const video = message.metadata?.media === 'video';
  const Icon = video ? Video : Phone;
  const Direction = isOwn ? ArrowUpRight : ArrowDownLeft;
  const rawSeconds = Number(message.metadata?.durationSeconds ?? 0);
  const seconds = Number.isFinite(rawSeconds)
    ? Math.max(0, Math.floor(rawSeconds))
    : 0;
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const outcome =
    (
      {
        rejected: 'Rechazada',
        missed: isOwn ? 'Sin respuesta' : 'Perdida',
        failed: 'No se pudo conectar',
      } as Record<string, string>
    )[String(message.metadata?.status)] ??
    (isOwn ? 'Cancelada' : 'No contestada');
  const iconColor = accepted ? '#25a975' : '#e35d6a';

  return (
    <XStack
      width='100%'
      justify={isOwn ? 'flex-end' : 'flex-start'}
      py='$1'
    >
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
            bg={
              accepted ? 'rgba(37,169,117,0.12)' : 'rgba(227,93,106,0.12)'
            }
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
          {format(new Date(message.createdAt), 'dd MMM hh:mm a')}
        </Text>
      </YStack>
    </XStack>
  );
}
