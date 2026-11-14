import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const INCOMING_CALL_CATEGORY = 'messingerIncomingCall';
// The foreground call service owns the ringtone; notification updates are silent.
export const INCOMING_CALL_CHANNEL = 'pulse-incoming-calls-v2';
export const MESSAGE_CHANNEL = 'messages';
let setup: Promise<void> | undefined;
let messageSetup: Promise<void> | undefined;

/** Android 13 needs a channel before showing the notification-permission prompt. */
export function configureMessageNotificationChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (messageSetup) return messageSetup;
  messageSetup = Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL, {
    name: 'Mensajes',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  })
    .then(() => {})
    .catch((error) => {
      messageSetup = undefined;
      throw error;
    });
  return messageSetup;
}

export function configureNotificationChannels() {
  if (setup) return setup;
  setup = (async () => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    if (Platform.OS === 'android') {
      await configureMessageNotificationChannel();
      await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL, {
        name: 'Llamadas entrantes',
        importance: Notifications.AndroidImportance.MAX,
        sound: null,
        enableVibrate: true,
        vibrationPattern: [0, 500, 300, 500],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
      await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY, [
        {
          identifier: 'reject',
          buttonTitle: 'Rechazar',
          options: { opensAppToForeground: false, isDestructive: true },
        },
        { identifier: 'accept', buttonTitle: 'Aceptar', options: { opensAppToForeground: true } },
      ]);
    }
  })().catch((error) => {
    setup = undefined;
    throw error;
  });
  return setup;
}
