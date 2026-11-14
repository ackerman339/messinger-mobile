import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { configureNotificationChannels } from './notification-channels';

interface CallSettings {
  canUseFullScreenCalls(): boolean;
  openFullScreenCallSettings(): void;
  hasManufacturerCallSettings?(): boolean;
  openManufacturerCallSettings?(): void;
}
let pending = false;
const prompted = new Set<string>();
const manufacturerKey = 'call-manufacturer-permissions-explained-v1';
const visible = () => AppState.currentState === 'active';

function explain(title: string, message: string, open: () => void | Promise<unknown>) {
  return new Promise<void>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve() },
        {
          text: 'Abrir ajustes',
          onPress: () => {
            try {
              Promise.resolve(open()).catch(() => {
                Alert.alert(
                  'Abre los ajustes de pulse',
                  'En Ajustes > Aplicaciones > pulse puedes habilitar estos permisos.',
                );
              });
            } catch {
              Alert.alert(
                'Abre los ajustes de pulse',
                'En Ajustes > Aplicaciones > pulse puedes habilitar estos permisos.',
              );
            }
            resolve();
          },
        },
      ],
      { cancelable: true, onDismiss: resolve },
    );
  });
}

/** Run after the system notification request, never in parallel with it or from headless JS. */
export async function explainFullScreenCallPermission(manual = false) {
  if (pending || Platform.OS !== 'android' || !visible()) return;
  pending = true;
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (manual && visible() && !permission.granted && permission.canAskAgain) {
      await configureNotificationChannels();
      if (!visible()) return;
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!visible()) return;
    if (!permission.granted) {
      if (manual || !prompted.has('notifications')) {
        prompted.add('notifications');
        await explain(
          'Permitir notificaciones',
          'Activa las notificaciones de pulse para recibir avisos de mensajes y llamadas. En Notificaciones, permite también los avisos de llamadas.',
          () => Linking.openSettings(),
        );
      }
      return;
    }
    const audio = requireOptionalNativeModule<Partial<CallSettings>>('MessingerCallAudio');
    if (!audio) return;
    if (
      Number(Platform.Version) >= 34 &&
      audio.canUseFullScreenCalls &&
      !audio.canUseFullScreenCalls() &&
      (manual || !prompted.has('fullscreen'))
    ) {
      prompted.add('fullscreen');
      await explain(
        'Mostrar llamadas con la pantalla bloqueada',
        'Permite las notificaciones de pantalla completa de pulse para mostrar el panel cuando recibas una llamada con la pantalla apagada.',
        () => audio.openFullScreenCallSettings?.(),
      );
      return;
    }
    if (!visible()) return;
    if (!audio.hasManufacturerCallSettings?.()) {
      if (manual)
        Alert.alert(
          'Permisos de llamadas',
          'Las notificaciones y la pantalla completa están habilitadas. El micrófono y la cámara se solicitan al usarlos en una llamada.',
        );
      return;
    }
    if (
      !manual &&
      (prompted.has('manufacturer') || (await SecureStore.getItemAsync(manufacturerKey)))
    )
      return;
    if (!visible()) return;
    prompted.add('manufacturer');
    await explain(
      'Permitir avisos de llamadas en segundo plano',
      'En Otros permisos de pulse, permite “Mostrar en pantalla de bloqueo”, “Abrir nuevas ventanas mientras se ejecuta en segundo plano” y “Mostrar ventanas emergentes”. Estos ajustes adicionales del teléfono ayudan a mostrar las llamadas cuando no estás usando la app.',
      () => audio.openManufacturerCallSettings?.(),
    );
    // This records the explanation only: vendor permission grants cannot be verified here.
    await SecureStore.setItemAsync(manufacturerKey, 'shown');
  } finally {
    pending = false;
  }
}
