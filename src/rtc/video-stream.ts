import type { MediaStream } from 'react-native-webrtc';

/** RTCView resolves a native video track when it binds its stream URL. */
export function getVideoStreamKey(stream?: MediaStream) {
  if (!stream) return;
  const video = stream.getVideoTracks().find((track) => track.readyState === 'live');
  return video ? `${stream.toURL()}:${video.id}` : undefined;
}
