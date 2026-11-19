import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
interface NativeIncomingCall {
  getCallFlowVersion(): number;
  setCallPushUser?(user: string | null): void;
  presentIncomingCall(
    id: string,
    caller: string,
    media: string,
    name: string,
    expires: number,
  ): Promise<void>;
  presentIncomingGroupCall?(
    id: string, conversationId: string, caller: string, media: string, name: string, expires: number,
  ): Promise<void>;
  finishCallPresentation?(id: string, remote: boolean): void;
  dismissIncomingCall(id: string): void;
  clearCalls?(): void;
}
export function getNativeIncomingCall(): NativeIncomingCall | undefined {
  if (Platform.OS !== 'android') return;
  const native = requireOptionalNativeModule<NativeIncomingCall>('MessingerCallAudio');
  if (native?.getCallFlowVersion?.() === 2 && typeof native.presentIncomingCall === 'function')
    return native;
}
