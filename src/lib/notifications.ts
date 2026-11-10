import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { nativeCallService } from '@/src/services/native-call-service';
import { parseCallPush } from '@/src/services/call-push';
import { Platform } from 'react-native';

export async function getPushToken(requestPermission = false) {
  if (
    (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
    !Device.isDevice ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return null;
  }

  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const incoming = parseCallPush(notification)?.type === 'call-incoming' && nativeCallService.getSnapshot().ready;
      return { shouldShowBanner: !incoming, shouldShowList: !incoming,
        shouldPlaySound: !incoming, shouldSetBadge: false };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensajes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  let permissions = await Notifications.getPermissionsAsync();

  if (requestPermission && permissions.canAskAgain && permissions.status === 'undetermined') {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (
    !permissions.granted &&
    permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Missing EAS projectId for push notifications');
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  return token.data;
}
