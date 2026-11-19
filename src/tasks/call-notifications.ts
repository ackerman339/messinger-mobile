import type { NotificationTaskPayload } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { AppState, Platform } from 'react-native';
import { isExpiredCallPush, parseCallPush } from '../services/call-push';
import { configureNotificationChannels } from '../services/notification-channels';
import { parseMessageNotification, readNotificationData } from '../services/notification-data';
import { installNotificationPresentation } from '../services/notification-presentation';
import { claimMessageNotification } from '../services/notification-state';
import { parseGroupCallPush } from '../group-calls/group-call-push';
import {
  dismissGroupCallNotification, handleGroupCallNotificationAction, showGroupCallNotification,
} from '../group-calls/group-call-notifications';
import { isTerminal } from '../types/call';

import {
  cleanupIncomingCallNotifications,
  dismissCallPushNotification,
  dismissIncomingCallNotification,
} from '../services/call-notification-service';

import { callClient, receiveCallPush, respondToCall } from '../services/call-runtime';

const taskName = 'pulse-call-notifications-v2';
const legacyTaskName = 'messinger-call-notifications';

installNotificationPresentation();

/** A body tap accepts, explicit buttons accept/reject; unrelated actions never accept. */
export async function handleCallNotificationResponse(
  response: NotificationTaskPayload | Notifications.NotificationResponse,
) {
  if (!('actionIdentifier' in response)) return false;
  const groupCall = parseGroupCallPush(response);
  if (groupCall) return handleGroupCallNotificationAction(groupCall, response.actionIdentifier);
  const push = parseCallPush(response);
  if (!push) return false;
  if (push.type === 'call-missed' || isExpiredCallPush(push)) {
    dismissIncomingCallNotification(push.callId);
    await dismissCallPushNotification(response);
    return true;
  }
  const action = response.actionIdentifier;
  if (
    action !== 'accept' &&
    action !== 'reject' &&
    action !== Notifications.DEFAULT_ACTION_IDENTIFIER
  )
    return false;
  await respondToCall(push.callId, action === 'reject' ? 'reject' : 'accept', push.expiresAt);
  return true;
}

// Keep a background rejection task alive while the socket authenticates and CALL_SYNC retries.
async function waitForRejection(callId: string) {
  const finished = () => {
    const call = callClient.getSnapshot();
    return (
      !call || call.callId !== callId || (call.status !== 'requesting' && isTerminal(call.status))
    );
  };
  if (finished()) return;
  await new Promise<void>((resolve) => {
    const stop = callClient.subscribe(() => {
      if (finished()) {
        clearTimeout(timer);
        stop();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      stop();
      resolve();
    }, 12_000);
    if (finished()) {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
}

const runNotificationTask: Parameters<
  typeof TaskManager.defineTask<NotificationTaskPayload>
>[1] = async ({ data, error }) => {
  if (error || !data || typeof data !== 'object' || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;
  if ('actionIdentifier' in data) {
    // Accept/body taps launch the app. Only its foreground runtime may claim the WebRTC call.
    // Keep the stored response for getLastNotificationResponseAsync during a cold launch.
    if (data.actionIdentifier !== 'reject' || (Platform.OS === 'ios' && !parseGroupCallPush(data))) return;
    if (await handleCallNotificationResponse(data)) {
      if (data.actionIdentifier === 'reject') {
        const call = parseCallPush(data);
        if (call) await waitForRejection(call.callId);
      }
      await Notifications.clearLastNotificationResponseAsync();
    }
    return;
  }
  if (readNotificationData(data)?.localNotification) return;
  if (await handleGroupPush(data) || Platform.OS !== 'android') return;
  const push = parseCallPush(data);
  if (push) {
    await receiveCallPush(push);
    if (push.type === 'call-missed' || isExpiredCallPush(push))
      await dismissCallPushNotification(data);
  } else if (AppState.currentState !== 'active') {
    // The native Expo transport already displays remote message notifications.
    const message = parseMessageNotification(data);
    if (message) claimMessageNotification(message.messageId, 'remote');
  }
};
async function handleGroupPush(payload: unknown) {
  const group = parseGroupCallPush(payload);
  if (!group) return false;
  if (group.type === 'group-call-incoming') await showGroupCallNotification(group);
  else dismissGroupCallNotification(group.id);
  return true;
}

TaskManager.defineTask<NotificationTaskPayload>(taskName, runNotificationTask);
// An upgrade can receive a push before the first foreground launch migrates its registration.
TaskManager.defineTask<NotificationTaskPayload>(legacyTaskName, runNotificationTask);

export async function registerCallNotificationTask() {
  await configureNotificationChannels();
  await cleanupIncomingCallNotifications().catch(() => {});
  if (Platform.OS === 'android' && (await TaskManager.isTaskRegisteredAsync(legacyTaskName))) {
    await Notifications.unregisterTaskAsync(legacyTaskName);
  }
  if ((Platform.OS === 'android' || Platform.OS === 'ios') && !(await TaskManager.isTaskRegisteredAsync(taskName))) {
    await Notifications.registerTaskAsync(taskName);
  }
}

export function subscribeCallNotifications() {
  let active = true;
  const foreground = Notifications.addNotificationReceivedListener((notification) => {
    if (readNotificationData(notification)?.localNotification) return;
    if (parseGroupCallPush(notification)) {
      void handleGroupPush(notification).catch(() => {});
      return;
    }
    const push = parseCallPush(notification);
    if (push) void receiveCallPush(push).catch(() => {});
  });
  const responses = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleCallNotificationResponse(response)
      .then((handled) => {
        if (handled) void Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
  });
  void Notifications.getLastNotificationResponseAsync()
    .then(async (response) => {
      if (active && response && (await handleCallNotificationResponse(response)))
        await Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => {});
  return () => {
    active = false;
    foreground.remove();
    responses.remove();
  };
}
