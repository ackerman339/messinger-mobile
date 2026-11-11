import type { Conversation } from '../types/conversation';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isNotificationId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);

/** Expo exposes different envelopes for foreground notifications, taps and FCM tasks. */
export function readNotificationData(
  payload: unknown,
  depth = 0,
): Record<string, unknown> | undefined {
  if (depth > 6) return;
  if (typeof payload === 'string') {
    if (payload.length > 16384) return;
    try {
      return readNotificationData(JSON.parse(payload), depth + 1);
    } catch {
      return;
    }
  }
  if (!payload || typeof payload !== 'object') return;
  const value = payload as Record<string, unknown>;
  if (typeof value.type === 'string') return value;
  for (const key of ['dataString', 'body', 'data', 'notification', 'request', 'content']) {
    const data = readNotificationData(value[key], depth + 1);
    if (data) return data;
  }
}

export interface MessageNotificationData {
  type: 'message';
  messageId: string;
  conversationId: string;
  localNotification?: 'message';
}
export function parseMessageNotification(payload: unknown): MessageNotificationData | undefined {
  const data = readNotificationData(payload);
  if (
    data?.type !== 'message' ||
    !isNotificationId(data.messageId) ||
    !isNotificationId(data.conversationId)
  )
    return;
  return {
    type: 'message',
    messageId: data.messageId,
    conversationId: data.conversationId,
    ...(data.localNotification === 'message' ? { localNotification: 'message' as const } : {}),
  };
}

/** Only private incoming messages participate in the notification flow. */
export function getMessageNotification(
  payload: unknown,
  userId: string,
  conversations: Map<string, Conversation>,
) {
  if (!payload || typeof payload !== 'object') return;
  const message = payload as Record<string, unknown>;
  if (
    typeof message.senderId !== 'string' ||
    message.senderId === userId ||
    (message.type && message.type !== 'MESSAGE')
  )
    return;
  const included = message.conversation as Conversation | undefined;
  const conversationId = included?.id ?? message.conversationId;
  const messageId = message.messageId ?? message.id;
  if (!isNotificationId(conversationId) || !isNotificationId(messageId)) return;
  const conversation = conversations.get(conversationId) ?? included;
  const sender =
    conversation?.members?.find((member) => member.userId === message.senderId)?.username ||
    'Nuevo mensaje';
  if (conversation?.type !== 'PRIVATE') return;
  const title = sender;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const attachment = attachments[0] as { contentType?: string } | undefined;
  const contentType = attachment?.contentType ?? '';
  const fallback = contentType.startsWith('image/')
    ? '📷 Foto'
    : contentType.startsWith('video/')
      ? '🎥 Video'
      : contentType.startsWith('audio/')
        ? '🎤 Nota de voz'
        : attachments.length
          ? '📎 Archivo adjunto'
          : 'Nuevo mensaje';
  const body =
    typeof message.content === 'string' && message.content.trim()
      ? message.content.trim()
      : fallback;
  return {
    title: title.slice(0, 100),
    body: body.slice(0, 240),
    data: {
      type: 'message' as const,
      messageId,
      conversationId,
      localNotification: 'message' as const,
    },
  };
}
