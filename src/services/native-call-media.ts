import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface NativeCallMedia {
  getCallFlowVersion(): number;
  startCallMedia(callId: string, media: string): Promise<void>;
  stopCallMedia(callId: string): void;
  finishCallPresentation(callId: string, remote: boolean): void;
  setCallPanelVisible(callId: string, visible: boolean): void;
}
const native = () => {
  if (Platform.OS !== 'android') return;
  const audio = requireOptionalNativeModule<Partial<NativeCallMedia>>('MessingerCallAudio');
  return audio?.getCallFlowVersion?.() === 2 ? audio : undefined;
};

export async function startCallMedia(callId: string, media = 'audio') {
  const audio = native();
  if (!audio?.startCallMedia)
    throw new Error('Instala el APK nuevo para mantener el micrófono con la pantalla bloqueada.');
  await audio.startCallMedia(callId, media);
}
export function stopCallMedia(callId: string) {
  native()?.stopCallMedia?.(callId);
}
export function finishCallPresentation(callId: string) {
  native()?.finishCallPresentation?.(callId, false);
}
export function setCallPanelVisible(callId: string, visible: boolean) {
  native()?.setCallPanelVisible?.(callId, visible);
}
