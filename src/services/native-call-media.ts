import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface NativeCallMedia {
  startCallMedia(callId: string): Promise<void>;
  stopCallMedia(callId: string): void;
  finishCallPresentation(callId: string): void;
}
const native = () =>
  Platform.OS === 'android'
    ? requireOptionalNativeModule<Partial<NativeCallMedia>>('MessingerCallAudio')
    : undefined;

export async function startCallMedia(callId: string) {
  const audio = native();
  if (!audio?.startCallMedia)
    throw new Error('Instala el APK nuevo para mantener el micrófono con la pantalla bloqueada.');
  await audio.startCallMedia(callId);
}
export function stopCallMedia(callId: string) {
  native()?.stopCallMedia?.(callId);
}
export function finishCallPresentation(callId: string) {
  native()?.finishCallPresentation?.(callId);
}
