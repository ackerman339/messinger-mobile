import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { explainFullScreenCallPermission } from '@/src/services/call-fullscreen-permission';
import { registerCallNotificationTask } from '@/src/tasks/call-notifications';
import {
  registerPushNotifications,
  setPushRegistrationUser,
  unregisterPushNotifications,
} from '@/src/services/push-registration';
import type { User } from '@/src/types/user';

const retryDelays = [2000, 5000, 15_000, 30_000];

export function usePushNotifications(user: User | null) {
  const userId = user?.id;
  useEffect(() => {
    if (!userId || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;
    setPushRegistrationUser(userId);
    let active = true;
    let registering = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let callTaskReady = false;
    let permissionRequested = false;

    // Local call UI/task setup must never gate acquisition or backend registration of a push token.
    async function prepareCallNotifications() {
      if (callTaskReady || !active) return;
      try {
        await registerCallNotificationTask();
        callTaskReady = true;
      } catch {
        console.warn('[push] call-notification-setup-failed');
      }
    }
    async function register(requestPermission = false, force = false) {
      if (!active || registering) return;
      registering = true;
      clearTimeout(retry);
      try {
        const shouldRequest =
          requestPermission && !permissionRequested && AppState.currentState === 'active';
        if (shouldRequest) permissionRequested = true;
        const result = await registerPushNotifications(userId!, {
          requestPermission: shouldRequest,
          force,
        });
        if (!active) return;
        // Request permission only in foreground; the settings guidance follows the OS dialog.
        if (Platform.OS === 'android' && AppState.currentState === 'active')
          await explainFullScreenCallPermission();
        if (!active) return;
        if (result.status === 'registered') failures = 0;
        else if (
          result.status === 'failed' &&
          failures < retryDelays.length &&
          AppState.currentState === 'active'
        ) {
          const delay = retryDelays[failures++];
          retry = setTimeout(() => {
            void register();
          }, delay);
        }
      } finally {
        registering = false;
      }
    }
    if (AppState.currentState === 'active') void register(true);
    void prepareCallNotifications();
    const state = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        failures = 0;
        void register(true, true);
        void prepareCallNotifications();
      } else clearTimeout(retry);
    });
    const tokens = Notifications.addPushTokenListener(() => {
      void register(false, true);
    });
    return () => {
      active = false;
      clearTimeout(retry);
      state.remove();
      tokens.remove();
    };
  }, [userId]);

  return { unregisterPushNotifications };
}
