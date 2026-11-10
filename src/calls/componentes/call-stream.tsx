import { getWebRTC } from '../../rtc/native-webrtc';
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
  const { RTCView } = getWebRTC();
  return (
    <RTCView
      streamURL={stream.toURL()}
      style={{ width: '100%', height: '100%' }}
      objectFit='cover'
      mirror={local && front}
      zOrder={local ? 1 : 0}
    />
  );
}
