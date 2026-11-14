import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { configureNotificationChannels } from './notification-channels';
import {
  blockCallNotification,
  getNotificationContext,
  isCallNotificationBlocked,
} from './notification-state';
import { isExpiredCallPush, parseCallPush } from './call-push';
import { readNotificationData } from './notification-data';
import { getNativeIncomingCall } from './native-incoming-call';
import { silenceCallSound } from './call-sound-service';
import type { CallMedia } from '../types/call';

type IncomingCall = {
  callId: string;
  callerId: string;
  media: CallMedia;
  name: string;
  expiresAt?: string;
};
type Presentation = { fingerprint: string; revision: number; queue: Promise<void> };
const pending = new Map<string, Presentation>();

/** Serialize bridge requests; Android owns the notification, looping sound and expiration. */
export function showIncomingCallNotification(call: IncomingCall) {
  if (
    Platform.OS !== 'android' ||
    getNotificationContext().loggedOut ||
    isCallNotificationBlocked(call.callId)
  )
    return;
  const expires = call.expiresAt ? Date.parse(call.expiresAt) : Date.now() + 60_000;
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    dismissIncomingCallNotification(call.callId);
    return;
  }
  const version = getNotificationContext().version;
  const fingerprint = JSON.stringify([
    call.callerId,
    call.media,
    call.name,
    call.expiresAt,
    version,
  ]);
  let entry = pending.get(call.callId);
  if (entry?.fingerprint === fingerprint) return entry.queue;
  if (!entry) {
    entry = { fingerprint, revision: 0, queue: Promise.resolve() };
    pending.set(call.callId, entry);
  }
  entry.fingerprint = fingerprint;
  const current = entry;
  const revision = ++current.revision;
  const live = () =>
    pending.get(call.callId) === current &&
    current.revision === revision &&
    getNotificationContext().version === version &&
    !getNotificationContext().loggedOut &&
    !isCallNotificationBlocked(call.callId);
  current.queue = current.queue
    .catch(() => {})
    .then(async () => {
      await configureNotificationChannels();
      if (!live()) return;
      const permission = await Notifications.getPermissionsAsync();
      if (!live()) return;
      if (!permission.granted) {
        current.fingerprint = '';
        return;
      }
      const native = getNativeIncomingCall();
      if (!native) throw new Error('Instala el APK nuevo para recibir llamadas.');
      await native.presentIncomingCall(
        call.callId,
        call.callerId,
        call.media,
        call.name || 'Contacto',
        expires,
      );
      // Never cancel a shared native alert because an older JS revision finished late.
      if (live()) await dismissCallPushNotification({ ...call, type: 'call-incoming' });
    })
    .catch((error) => {
      if (pending.get(call.callId) === current && current.revision === revision)
        current.fingerprint = '';
      console.warn('[calls] incoming-presentation-failed', error);
    });
  return current.queue;
}
export function dismissIncomingCallNotification(id: string) {
  pending.delete(id);
  blockCallNotification(id);
  silenceCallSound(id);
  getNativeIncomingCall()?.dismissIncomingCall(id);
  void Notifications.dismissNotificationAsync('messinger-call:' + id).catch(() => {});
}
export function dismissAllIncomingCallNotifications() {
  pending.clear();
  getNativeIncomingCall()?.clearCalls?.();
  void cleanupIncomingCallNotifications(true).catch(() => {});
}
export async function cleanupIncomingCallNotifications(all = false) {
  const version = getNotificationContext().version;
  const notices = await Notifications.getPresentedNotificationsAsync();
  if (version !== getNotificationContext().version) return;
  for (const notice of notices) {
    const call = parseCallPush(notice);
    if (
      call?.type === 'call-incoming' &&
      (all || isExpiredCallPush(call) || isCallNotificationBlocked(call.callId))
    )
      await Notifications.dismissNotificationAsync(notice.request.identifier);
  }
}
export async function dismissCallPushNotification(payload: unknown) {
  const call = parseCallPush(payload);
  if (!call) return;
  const version = getNotificationContext().version;
  const notices = await Notifications.getPresentedNotificationsAsync();
  if (version !== getNotificationContext().version) return;
  for (const notice of notices) {
    const other = parseCallPush(notice);
    if (
      other?.type === 'call-incoming' &&
      other.callId === call.callId &&
      readNotificationData(notice)?.localNotification !== 'call' &&
      notice.request.identifier !== 'messinger-call:' + call.callId
    )
      await Notifications.dismissNotificationAsync(notice.request.identifier);
  }
}
