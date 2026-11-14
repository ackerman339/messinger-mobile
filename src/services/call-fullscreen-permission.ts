import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { Alert, AppState, Platform } from 'react-native';

interface FullScreenCalls {
  canUseFullScreenCalls(): boolean;
  openFullScreenCallSettings(): void;
}
let pending = false;
const key = 'call-fullscreen-explained-v2';
export async function explainFullScreenCallPermission() {
  if (
    pending ||
    Platform.OS !== 'android' ||
    Number(Platform.Version) < 34 ||
    AppState.currentState !== 'active'
  )
    return;
  const audio = requireOptionalNativeModule<Partial<FullScreenCalls>>('MessingerCallAudio');
  if (!audio?.canUseFullScreenCalls || audio.canUseFullScreenCalls()) return;
  pending = true;
  try {
    const lastShown = Number(await SecureStore.getItemAsync(key));
    if (Number.isFinite(lastShown) && Date.now() - lastShown < 7 * 24 * 60 * 60_000) return;
    await SecureStore.setItemAsync(key, String(Date.now()));
    Alert.alert(
      'Mostrar llamadas con la pantalla bloqueada',
      'Permite las notificaciones de pantalla completa de pulse para ver el panel de llamadas entrantes con el teléfono bloqueado.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => audio.openFullScreenCallSettings?.() },
      ],
    );
  } finally {
    pending = false;
  }
}
