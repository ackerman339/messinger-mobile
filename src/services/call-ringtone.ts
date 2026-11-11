import { createAudioPlayer } from 'expo-audio';
import type { CallView } from '../state/call-session';

export type CallSound = 'incoming' | 'outgoing';
const sources = {
  incoming: require('../../assets/sounds/incoming-call.wav'),
  outgoing: require('../../assets/sounds/outgoing-call.wav'),
};

// Keep the same states, assets and volumes as the web client.
export function getCallSound(call: CallView | null): CallSound | undefined {
  if (!call || call.ending || call.answering) return;
  if (call.incoming) return call.status === 'ringing' ? 'incoming' : undefined;
  if (call.status === 'requesting' || call.status === 'ringing') return 'outgoing';
}

export function createCallRingtone(sound: CallSound) {
  const player = createAudioPlayer(sources[sound], { updateInterval: 250 });
  let removed = false;
  let restarting = false;
  let finished = false;
  const events = player.addListener('playbackStatusUpdate', (status) => {
    if (removed) return;
    // Reapply after the asset loads, not just before native preparation completes.
    if (status.isLoaded && !status.loop) player.loop = true;
    if (!status.didJustFinish) {
      finished = false;
      return;
    }
    if (finished || restarting) return;
    finished = true;
    restarting = true;
    // Some native players report an ended item despite repeat mode; replay from its start.
    void player
      .seekTo(0)
      .then(() => {
        if (!removed) {
          player.loop = true;
          player.play();
        }
      })
      .catch(() => {})
      .finally(() => {
        restarting = false;
      });
  });
  player.loop = true;
  player.volume = sound === 'outgoing' ? 0.3 : 0.6;
  try {
    player.play();
  } catch (error) {
    events.remove();
    player.remove();
    throw error;
  }
  return () => {
    if (removed) return;
    removed = true;
    events.remove();
    try {
      player.pause();
    } finally {
      player.remove();
    }
  };
}
