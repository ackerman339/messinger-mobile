import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
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
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
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
