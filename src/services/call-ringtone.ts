import { createAudioPlayer } from 'expo-audio';
import type { CallView } from '../state/call-session';

export type CallSound = 'incoming' | 'outgoing';
const sources = {
  incoming: require('../../assets/sounds/incoming-call.wav'),
  outgoing: require('../../assets/sounds/outgoing-call.wav'),
};

export function getCallSound(call: CallView | null, nativeRinging = false): CallSound | undefined {
  if (!call || call.ending || call.answering) return;
  if (call.incoming) return call.status === 'ringing' && !nativeRinging ? 'incoming' : undefined;
  if (call.status === 'requesting' || call.status === 'ringing') return 'outgoing';
}

export function createCallRingtone(sound: CallSound) {
  const player = createAudioPlayer(sources[sound]);
  player.loop = true;
  player.volume = sound === 'outgoing' ? 0.3 : 0.6;
  player.play();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    try {
      player.pause();
    } finally {
      player.remove();
    }
  };
}
