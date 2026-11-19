import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { getNativeIncomingCall } from '../services/native-incoming-call';
import {
  configureNotificationChannels,
  INCOMING_CALL_CATEGORY,
  INCOMING_CALL_CHANNEL,
} from '../services/notification-channels';
import {
  blockCallNotification,
  getNotificationContext,
  isCallNotificationBlocked,
} from '../services/notification-state';
import { tokenStorage } from '../token-storage';
import { groupPushExpired, parseGroupCallPush } from './group-call-push';
import type { GroupCallPush } from './group-call-push';
import { groupCallApi } from './api';
import type { GroupCallAction } from './types';

const notices = new Map<string, number>();
const notificationId = (id: string) => `messinger-group-call:${id}`;
let nextAction:
  | { action: GroupCallAction; owner?: string; version: number; expiresAt?: string }
  | undefined;
const listeners = new Set<() => void>();

export function publishGroupCallAnswer(push: GroupCallPush) {
  nextAction = {
    action: { ...push, action: 'accept' },
    owner: push.recipientId,
    expiresAt: push.expiresAt,
    version: getNotificationContext().version,
  };
  for (const listener of listeners) listener();
}

export function subscribeGroupCallAnswers(
  userId: string,
  callback: (action: GroupCallAction) => void,
) {
  let active = true;
  const consume = () => {
    if (!active || !nextAction) return;
    const { action, owner, expiresAt, version } = nextAction;
    nextAction = undefined;
    if (
      version === getNotificationContext().version &&
      (!owner || owner === userId) &&
      (!expiresAt || Date.parse(expiresAt) > Date.now())
    )
      callback(action);
  };
  listeners.add(consume);
  queueMicrotask(consume);
  return () => {
    active = false;
    listeners.delete(consume);
  };
}

export function dismissGroupCallNotification(id: string) {
  notices.delete(id);
  blockCallNotification(id);
  getNativeIncomingCall()?.finishCallPresentation?.(id, true);
  void Notifications.dismissNotificationAsync(notificationId(id)).catch(() => {});
  void Notifications.getPresentedNotificationsAsync()
    .then(async (entries) => {
      for (const entry of entries) {
        const push = parseGroupCallPush(entry);
        if (push?.type === 'group-call-incoming' && push.id === id) {
          await Notifications.dismissNotificationAsync(entry.request.identifier);
        }
      }
    })
    .catch(() => {});
}

export async function showGroupCallNotification(push: GroupCallPush) {
  if (
    groupPushExpired(push) ||
    isCallNotificationBlocked(push.id) ||
    notices.has(push.id)
  )
    return;
  const context = getNotificationContext();
  if (
    context.loggedOut ||
    context.callInProgress ||
    (context.userId && push.recipientId && push.recipientId !== context.userId)
  )
    return;
  const native = getNativeIncomingCall();
  // The Android receiver owns notifications and sound while the app is suspended.
  if (AppState.currentState !== 'active' && (Platform.OS === 'ios' || native?.presentIncomingGroupCall)) return;
  const deadline = push.expiresAt ? Date.parse(push.expiresAt) : Date.now() + 60_000;
  const live = () =>
    getNotificationContext().version === context.version &&
    !isCallNotificationBlocked(push.id) &&
    Date.now() < deadline;
  for (const [id, until] of notices) if (until <= Date.now()) notices.delete(id);
  notices.set(push.id, deadline);
  let presented = false;
  try {
    if (!(await tokenStorage.getAccessToken()) || !live()) return;
    await configureNotificationChannels();
    if (!live() || !(await Notifications.getPermissionsAsync()).granted || !live())
      return;
    if (native?.presentIncomingGroupCall) {
      await native.presentIncomingGroupCall(
        push.id,
        push.conversationId,
        push.callerId,
        push.media,
        push.groupName,
        deadline,
      );
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: notificationId(push.id),
        content: {
          title: push.groupName,
          body:
            push.media === 'video'
              ? 'Videollamada grupal entrante'
              : 'Llamada grupal entrante',
          categoryIdentifier: INCOMING_CALL_CATEGORY,
          sound: AppState.currentState !== 'active',
          data: {
            ...push,
            callId: push.id,
            recipientId: push.recipientId ?? context.userId,
            localNotification: 'group-call',
            expiresAt: push.expiresAt,
          },
        },
        trigger: Platform.OS === 'android' ? { channelId: INCOMING_CALL_CHANNEL } : null,
      });
    }
    presented = true;
    if (!live()) dismissGroupCallNotification(push.id);
  } catch {
    // A failed notification does not interrupt the call.
  } finally {
    if (!presented && notices.get(push.id) === deadline) notices.delete(push.id);
  }
}

export async function handleGroupCallNotificationAction(
  push: GroupCallPush,
  action: string,
) {
  const { DEFAULT_ACTION_IDENTIFIER } = Notifications;
  const context = getNotificationContext();
  if (
    context.loggedOut ||
    (context.userId && push.recipientId && push.recipientId !== context.userId)
  )
    return false;
  if (push.type !== 'group-call-incoming' || groupPushExpired(push)) {
    dismissGroupCallNotification(push.id);
    return true;
  }
  if (action !== 'accept' && action !== 'reject' && action !== DEFAULT_ACTION_IDENTIFIER)
    return false;
  if (isCallNotificationBlocked(push.id)) return true;
  dismissGroupCallNotification(push.id);
  if (action === 'reject') await groupCallApi.decline(push).catch(() => {});
  else publishGroupCallAnswer(push);
  return true;
}
