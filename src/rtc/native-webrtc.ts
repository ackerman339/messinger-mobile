import { NativeModules, Platform } from 'react-native';
import type * as WebRTC from 'react-native-webrtc';

export function hasNativeCalling() {
  return Platform.OS === 'android' && !!NativeModules.WebRTCModule && !!NativeModules.RNCallKeep;
}

export function getWebRTC(): typeof WebRTC {
  if (!hasNativeCalling())
    throw new Error(
      'Las llamadas requieren una compilación de desarrollo de Android con WebRTC y Telecom.',
    );
  // Avoid evaluating a native-only package in Expo Go or unsupported platforms.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-webrtc');
}
