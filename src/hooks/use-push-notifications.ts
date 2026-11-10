import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { getPushToken } from '@/src/lib/notifications';
import { pushSubscriptionService } from '@/src/services/push-subscription';

import type { User } from '@/src/types/user';

export function usePushNotifications(user: User | null) {
  const userId = user?.id;
  const tokenRef = useRef<string | null>(null);
  const registrationRef = useRef<Promise<void> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!userId || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
      return;
    }

    let active = true;
    let registering = false;
    stoppedRef.current = false;
    const platform = Platform.OS === 'android' ? 'ANDROID' : 'IOS';

    function register(requestPermission = false) {
      if (!active || stoppedRef.current || registering) {
        return;
      }

      registering = true;

      const task = (async () => {
        const token = await getPushToken(requestPermission);

        if (!active || stoppedRef.current) {
          return;
        }

        if (!token) {
          if (tokenRef.current) {
            await pushSubscriptionService.unsubscribeMobile(tokenRef.current);
            tokenRef.current = null;
          }
          return;
        }

        // Keep the token even if the response is lost, so logout can remove it.
        tokenRef.current = token;
        await pushSubscriptionService.subscribeMobile({ token, platform });
      })()
        .catch(() => {
          console.warn('[push] Failed to register notifications; will retry when the app resumes');
        })
        .finally(() => {
          registering = false;
          if (registrationRef.current === task) {
            registrationRef.current = null;
          }
        });

      registrationRef.current = task;
    }

    register(true);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        register();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  async function unregisterPushNotifications() {
    stoppedRef.current = true;

    // A registration already in flight must finish before deleting its token.
    await registrationRef.current;

    if (tokenRef.current) {
      try {
        await pushSubscriptionService.unsubscribeMobile(tokenRef.current);
        tokenRef.current = null;
      } catch {
        console.warn('[push] Failed to unregister notifications');
      }
    }
  }

  return { unregisterPushNotifications };
}
