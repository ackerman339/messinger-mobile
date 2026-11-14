import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import type { CallMedia } from '../types/call';

/** Notification acceptance opens the app asynchronously from the lock screen. */
async function waitForForeground() {
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve, reject) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clearTimeout(timer);
      subscription.remove();
      resolve();
    });
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error('Abre pulse para permitir el micrófono y la cámara.'));
    }, 15_000);
    // The app may have become visible between the initial check and subscription.
    if (AppState.currentState === 'active') {
      clearTimeout(timer);
      subscription.remove();
      resolve();
    }
  });
}

export async function requestCallPermissions(media: CallMedia, foreground = false) {
  if (Platform.OS !== 'android') throw new Error('Las llamadas están habilitadas en Android.');
  if (foreground) await waitForForeground();
  const permissions = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ...(media === 'video' ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
  ];
  const missing: Permission[] = [];
  for (const permission of permissions) {
    if (!(await PermissionsAndroid.check(permission))) missing.push(permission);
  }
  // Bluetooth is optional and must not block a background voice call whose mic is permitted.
  const bluetooth = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  const optional: Permission[] = [];
  if (
    Number(Platform.Version) >= 31 &&
    AppState.currentState === 'active' &&
    !(await PermissionsAndroid.check(bluetooth))
  )
    optional.push(bluetooth);
  if (!missing.length && !optional.length) return;
  await waitForForeground();
  const results = await PermissionsAndroid.requestMultiple([...missing, ...optional]);
  if (missing.some((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error(
      'Permite el acceso al micrófono y, para video, a la cámara en los ajustes de la aplicación.',
    );
  }
}
