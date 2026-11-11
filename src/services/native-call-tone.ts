import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { CallSound } from './call-ringtone';

interface NativeCallTone {
  startCallTone(key: string, callId: string, sound: CallSound, expiresAt: number): void;
  stopCallTone(key: string): void;
  stopCallToneBeforeMedia(): Promise<void>;
}

export function getNativeCallTone(): NativeCallTone | undefined {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 26) return;
  const audio = requireOptionalNativeModule<NativeCallTone>('MessingerCallAudio');
  // Older development builds still use the Expo Audio fallback until rebuilt.
  if (
    typeof audio?.startCallTone === 'function' &&
    typeof audio.stopCallTone === 'function' &&
    typeof audio.stopCallToneBeforeMedia === 'function'
  )
    return audio;
}
