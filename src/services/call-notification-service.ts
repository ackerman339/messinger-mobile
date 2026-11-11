import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  configureNotificationChannels,
  INCOMING_CALL_CATEGORY,
  INCOMING_CALL_CHANNEL,
} from './notification-channels';
import {
  blockCallNotification,
  getNotificationContext,
  isCallNotificationBlocked,
} from './notification-state';
import { isExpiredCallPush, parseCallPush } from './call-push';
import { silenceCallSound } from './call-sound-service';
import type { CallMedia } from '../types/call';

type IncomingCall = {
  callId: string;
  callerId: string;
  media: CallMedia;
  name: string;
  expiresAt?: string;
};
type Entry = {
  call: IncomingCall;
  fingerprint: string;
  revision: number;
  timer: ReturnType<typeof setTimeout>;
  queue: Promise<void>;
};
const entries = new Map<string, Entry>();
const identifier = (id: string) => `messinger-call:${id}`;

export function showIncomingCallNotification(call: IncomingCall) {
  if (
    Platform.OS !== 'android' ||
    isCallNotificationBlocked(call.callId) ||
    getNotificationContext().loggedOut
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
    call.name,
    call.media,
    call.expiresAt,
    version,
  ]);
  let entry = entries.get(call.callId);
  if (entry?.fingerprint === fingerprint) return;
  if (!entry) {
    entry = {
      call,
      fingerprint,
      revision: 0,
      timer: setTimeout(() => dismissIncomingCallNotification(call.callId), expires - Date.now()),
      queue: Promise.resolve(),
    };
    entries.set(call.callId, entry);
  } else {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(
      () => dismissIncomingCallNotification(call.callId),
      expires - Date.now(),
    );
    entry.call = call;
    entry.fingerprint = fingerprint;
  }
  const pending = entry;
  const revision = ++pending.revision;
  const live = () =>
    entries.get(call.callId) === pending &&
    pending.revision === revision &&
    !isCallNotificationBlocked(call.callId) &&
    getNotificationContext().version === version;
  pending.queue = pending.queue
    .then(async () => {
      await configureNotificationChannels();
      if (!live()) return;
      const permission = await Notifications.getPermissionsAsync();
      if (!live()) return;
      if (!permission.granted) {
        // A later state sync can retry if the user grants permission while it is ringing.
        pending.fingerprint = '';
        return;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: identifier(call.callId),
        content: {
          title: call.name || 'Contacto',
          body: call.media === 'video' ? 'Videollamada entrante' : 'Llamada de voz entrante',
          data: {
            type: 'call-incoming',
            callId: call.callId,
            callerId: call.callerId,
            media: call.media,
            expiresAt: new Date(expires).toISOString(),
            localNotification: 'call',
          },
          categoryIdentifier: INCOMING_CALL_CATEGORY,
          sound: false,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: { channelId: INCOMING_CALL_CHANNEL },
      });
      if (!live()) await Notifications.dismissNotificationAsync(identifier(call.callId));
      else await dismissCallPushNotification({ ...call, type: 'call-incoming' });
    })
    .catch(() => {
      // Allow the next state sync to retry a failed local presentation.
      if (entries.get(call.callId) === pending && pending.revision === revision) {
        clearTimeout(pending.timer);
        entries.delete(call.callId);
      }
    });
}

export function dismissIncomingCallNotification(callId: string) {
  silenceCallSound(callId);
  blockCallNotification(callId);
  const entry = entries.get(callId);
  if (entry) {
    clearTimeout(entry.timer);
    entries.delete(callId);
  }
  // Serialize dismissal after an in-flight presentation so it cannot reappear after hang-up.
  void (entry?.queue ?? Promise.resolve())
    .then(() => Notifications.dismissNotificationAsync(identifier(callId)))
    .catch(() => {});
}

export function dismissAllIncomingCallNotifications() {
  for (const id of entries.keys()) dismissIncomingCallNotification(id);
  void cleanupIncomingCallNotifications(true).catch(() => {});
}

export async function cleanupIncomingCallNotifications(all = false) {
  const version = getNotificationContext().version;
  const presented = await Notifications.getPresentedNotificationsAsync();
  if (version !== getNotificationContext().version) return;
  for (const notification of presented) {
    const call = parseCallPush(notification);
    if (
      call?.type === 'call-incoming' &&
      (all || isExpiredCallPush(call) || isCallNotificationBlocked(call.callId))
    ) {
      await Notifications.dismissNotificationAsync(notification.request.identifier);
    }
  }
}

/** Remove the generic remote banner once it has been replaced by the call UI. */
export async function dismissCallPushNotification(payload: unknown) {
  const call = parseCallPush(payload);
  if (!call) return;
  const version = getNotificationContext().version;
  const presented = await Notifications.getPresentedNotificationsAsync();
  if (version !== getNotificationContext().version) return;
  for (const notification of presented) {
    const candidate = parseCallPush(notification);
    if (
      candidate?.type === 'call-incoming' &&
      candidate.callId === call.callId &&
      notification.request.identifier !== identifier(call.callId)
    )
      await Notifications.dismissNotificationAsync(notification.request.identifier);
  }
}
