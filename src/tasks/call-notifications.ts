import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppRegistry, Platform } from 'react-native';
import { isExpiredCallPush, parseCallPush } from '../services/call-push';
import { bindNativeCallEvents, receiveCallPush, respondToCall } from '../services/call-runtime';

import type { NotificationTaskPayload } from 'expo-notifications';

const taskName = 'messinger-call-notifications';

bindNativeCallEvents();
if (Platform.OS === 'android')
  AppRegistry.registerHeadlessTask(
    'RNCallKeepBackgroundMessage',
    () => async (event: { callUUID?: string; handle?: string }) => {
      if (!event.callUUID) return;
      await receiveCallPush({
        type: 'call-incoming',
        callId: event.callUUID.toLowerCase(),
        callerId: event.handle ?? '',
        media: 'audio',
      });
    },
  );

TaskManager.defineTask<NotificationTaskPayload>(taskName, async ({ data, error }) => {
  if (error || Platform.OS !== 'android') return;
  const push = parseCallPush(data);
  if (!push) return;
  if ('actionIdentifier' in data) {
    if (push.type === 'call-incoming' && !isExpiredCallPush(push)) {
      await respondToCall(push.callId, data.actionIdentifier === 'reject' ? 'reject' : 'accept');
    }
    return;
  }
  await receiveCallPush(push);
});

export async function registerCallNotificationTask() {
  if (Platform.OS === 'android' && !(await TaskManager.isTaskRegisteredAsync(taskName))) {
    await Notifications.registerTaskAsync(taskName);
  }
}

export function subscribeCallNotifications() {
  const foreground = Notifications.addNotificationReceivedListener((notification) => {
    const push = parseCallPush(notification);
    if (push) void receiveCallPush(push).catch(() => {});
  });
  const responses = Notifications.addNotificationResponseReceivedListener((response) => {
    const push = parseCallPush(response);
    if (push?.type === 'call-incoming' && !isExpiredCallPush(push)) {
      void respondToCall(push.callId, response.actionIdentifier === 'reject' ? 'reject' : 'accept');
    }
  });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const push = parseCallPush(response);
    if (push?.type === 'call-incoming' && !isExpiredCallPush(push)) {
      void respondToCall(
        push.callId,
        response?.actionIdentifier === 'reject' ? 'reject' : 'accept',
      );
      void Notifications.clearLastNotificationResponseAsync();
    }
  });
  return () => {
    foreground.remove();
    responses.remove();
  };
}
