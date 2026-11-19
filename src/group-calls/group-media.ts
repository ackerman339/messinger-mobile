import type { Room } from 'livekit-client';

type MediaKind = 'microphone' | 'camera';

export async function enableInitialMedia(
  room: Room,
  video: boolean,
  isConnected: () => boolean,
  requestPermission?: (kind: MediaKind) => Promise<void>,
) {
  const devices: MediaKind[] = video ? ['microphone', 'camera'] : ['microphone'];
  const failed: string[] = [];
  for (const device of devices) {
    if (!isConnected()) return;
    try {
      await requestPermission?.(device);
      if (!isConnected()) return;
      if (device === 'microphone') await room.localParticipant.setMicrophoneEnabled(true);
      else await room.localParticipant.setCameraEnabled(true);
    } catch {
      failed.push(device === 'microphone' ? 'el micrófono' : 'la cámara');
    }
  }
  if (failed.length)
    return `No se pudo activar ${failed.join(' ni ')}. Revisa los permisos y vuelve a intentarlo.`;
}
