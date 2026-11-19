import { isNotificationId, readNotificationData } from '../services/notification-data';
import type { GroupCallTarget } from './types';

export type GroupCallPush = GroupCallTarget & {
  type: 'group-call-incoming' | 'group-call-missed' | 'group-call-closed';
  callerId: string;
  groupName: string;
  expiresAt?: string;
  recipientId?: string;
};

export function parseGroupCallPush(payload: unknown): GroupCallPush | undefined {
  const data = readNotificationData(payload);
  if (
    !data ||
    (data.type !== 'group-call-incoming' &&
      data.type !== 'group-call-missed' &&
      data.type !== 'group-call-closed')
  )
    return;
  if (!isNotificationId(data.callId) || !isNotificationId(data.conversationId)) return;
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : undefined;
  if (
    data.type === 'group-call-incoming' &&
    (!expiresAt || !Number.isFinite(Date.parse(expiresAt)))
  )
    return;
  return {
    type: data.type,
    id: data.callId,
    conversationId: data.conversationId,
    callerId: typeof data.callerId === 'string' ? data.callerId : '',
    groupName:
      typeof data.groupName === 'string'
        ? data.groupName.trim().slice(0, 100) || 'Grupo'
        : 'Grupo',
    media: data.media === 'video' ? 'video' : 'audio',
    expiresAt,
    recipientId: typeof data.recipientId === 'string' ? data.recipientId : undefined,
  };
}

export function groupPushExpired(push: GroupCallPush) {
  return !!push.expiresAt && Date.parse(push.expiresAt) <= Date.now();
}
