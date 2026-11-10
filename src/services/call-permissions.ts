import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import type { CallMedia } from '../types/call';

/** Telecom opens the app asynchronously when answering from the lock screen. */
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
      reject(new Error('Abre Messinger para permitir el micrófono y la cámara.'));
    }, 15_000);
    // The app may have become visible between the initial check and subscription.
    if (AppState.currentState === 'active') {
      clearTimeout(timer);
      subscription.remove();
      resolve();
    }
  });
}

export async function requestCallPermissions(media: CallMedia) {
  if (Platform.OS !== 'android') throw new Error('Las llamadas están habilitadas en Android.');
  const permissions = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ...(media === 'video' ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
  ];
  const missing: Permission[] = [];
  for (const permission of permissions) {
    if (!(await PermissionsAndroid.check(permission))) missing.push(permission);
  }
  if (!missing.length) return;
  await waitForForeground();
  const results = await PermissionsAndroid.requestMultiple(missing);
  if (missing.some((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error(
      'Permite el acceso al micrófono y, para video, a la cámara en los ajustes de la aplicación.',
    );
  }
}
