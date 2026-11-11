import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface NativeIncomingCall {
  prepareIncomingCall?(
    callId: string,
    callerId: string,
    media: string,
    name: string,
    expiresAt: number,
  ): void;
  presentIncomingCall(
    callId: string,
    callerId: string,
    media: string,
    name: string,
    expiresAt: number,
  ): Promise<void>;
  dismissIncomingCall(callId: string): void;
}
export function getNativeIncomingCall(): NativeIncomingCall | undefined {
  if (Platform.OS !== 'android') return;
  const audio = requireOptionalNativeModule<NativeIncomingCall>('MessingerCallAudio');
  if (
    typeof audio?.presentIncomingCall === 'function' &&
    typeof audio.dismissIncomingCall === 'function'
  )
    return audio;
}
