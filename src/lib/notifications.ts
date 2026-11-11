import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { configureMessageNotificationChannel } from '@/src/services/notification-channels';

export type PushTokenStage =
  'environment' | 'message-channel' | 'permission' | 'native-token' | 'expo-token';

async function withPushTimeout<T>(
  request: Promise<T>,
  code: string,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getPushToken(
  requestPermission = false,
  onStage: (stage: PushTokenStage) => void = () => {},
) {
  onStage('environment');
  if (
    (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
    !Device.isDevice ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    console.info('[push] unavailable-environment', {
      platform: Platform.OS,
      physicalDevice: Device.isDevice,
      expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    });
    return null;
  }

  const Notifications = await import('expo-notifications');

  onStage('message-channel');
  await withPushTimeout(configureMessageNotificationChannel(), 'PUSH_CHANNEL_TIMEOUT', 10_000);
  onStage('permission');

  let permissions = await Notifications.getPermissionsAsync();

  if (
    requestPermission &&
    permissions.canAskAgain &&
    !permissions.granted &&
    permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (
    !permissions.granted &&
    permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    console.info('[push] notification-permission-required', {
      status: permissions.status,
      canAskAgain: permissions.canAskAgain,
    });
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    throw Object.assign(new Error('Missing EAS projectId for push notifications'), {
      code: 'PUSH_PROJECT_ID_MISSING',
    });
  }

  onStage('native-token');
  const devicePushToken = await withPushTimeout(
    Notifications.getDevicePushTokenAsync(),
    'PUSH_NATIVE_TOKEN_TIMEOUT',
    30_000,
  );
  onStage('expo-token');
  const token = await withPushTimeout(
    Notifications.getExpoPushTokenAsync({ projectId, devicePushToken }),
    'PUSH_EXPO_TOKEN_TIMEOUT',
    20_000,
  );

  return token.data;
}
