import { DisconnectReason, Room, RoomEvent } from 'livekit-client';
import { AppState, NativeModules, Platform } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { requestCameraPermissionsAsync } from 'expo-image-picker';
import { getNativeCallTone } from '../services/native-call-tone';
import { releaseChatRecorderForCall } from '../services/call-audio-ownership';

let sdk: typeof import('@livekit/react-native') | undefined;

export function supportsGroupCalling() {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    !!NativeModules.LKRNWebRTCModule &&
    !!NativeModules.LivekitReactNativeModule
  );
}

export function getLiveKitNative() {
  if (!supportsGroupCalling())
    throw new Error('LiveKit requiere una compilación nativa.');
  if (!sdk) {
    // Expo Go and Expo Web can still open the chat without loading this native SDK.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native: typeof import('@livekit/react-native') = require('@livekit/react-native');
    native.registerGlobals();
    sdk = native;
  }
  return sdk;
}

export type GroupRoomDisconnect = 'room-ended' | 'left' | 'unexpected';

export function createGroupRoom(
  onDisconnected: (reason: GroupRoomDisconnect) => void,
  onParticipantConnected: () => void,
) {
  getLiveKitNative();
  return new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true })
    .on(RoomEvent.Disconnected, (reason) => {
      if (
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.ROOM_CLOSED
      ) {
        onDisconnected('room-ended');
      } else if (
        reason === DisconnectReason.PARTICIPANT_REMOVED ||
        reason === DisconnectReason.CLIENT_INITIATED
      ) {
        onDisconnected('left');
      } else {
        onDisconnected('unexpected');
      }
    })
    .on(RoomEvent.ParticipantConnected, onParticipantConnected);
}

export async function prepareGroupAudio(waitForTone = true) {
  const { AudioSession, AndroidAudioTypePresets } = getLiveKitNative();
  if (waitForTone) await getNativeCallTone()?.stopCallToneBeforeMedia();
  await releaseChatRecorderForCall();
  await AudioSession.configureAudio({
    android: { audioTypeOptions: AndroidAudioTypePresets.communication },
    ios: { defaultOutput: 'speaker' },
  });
  try {
    await AudioSession.startAudioSession();
  } catch (error) {
    await AudioSession.stopAudioSession().catch(() => {});
    throw error;
  }
  return () => AudioSession.stopAudioSession();
}

export async function requestGroupMediaPermission(kind: 'microphone' | 'camera') {
  const permission =
    kind === 'microphone'
      ? await requestRecordingPermissionsAsync()
      : await requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      kind === 'microphone'
        ? 'Habilita el permiso de micrófono para hablar.'
        : 'Habilita el permiso de cámara para compartir video.',
    );
  }
  if (kind === 'microphone') await releaseChatRecorderForCall();
}

export function subscribeToForeground(refresh: () => void) {
  const listener = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') refresh();
  }, 30_000);
  return () => {
    clearInterval(timer);
    listener.remove();
  };
}
