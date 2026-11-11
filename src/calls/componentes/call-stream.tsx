import { getWebRTC } from '../../rtc/native-webrtc';
import { getVideoStreamKey } from '../../rtc/video-stream';
import type { MediaStream } from 'react-native-webrtc';

export function CallStream({
  stream,
  local = false,
  front = true,
}: {
  stream: MediaStream;
  local?: boolean;
  front?: boolean;
}) {
  const videoKey = getVideoStreamKey(stream);
  if (!videoKey) return null;
  const { RTCView } = getWebRTC();
  return (
    <RTCView
      key={videoKey}
      streamURL={stream.toURL()}
      style={{ width: '100%', height: '100%' }}
      objectFit='cover'
      mirror={local && front}
      zOrder={local ? 1 : 0}
    />
  );
}
