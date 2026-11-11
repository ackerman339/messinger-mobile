import { setAudioModeAsync } from 'expo-audio';
import { createCallRingtone, getCallSound } from './call-ringtone';
import { isTerminal } from '../types/call';
import type { CallView } from '../state/call-session';
import { getNativeCallTone } from './native-call-tone';

// Shared by foreground React and headless push execution; AppState does not own call audio.
let current: CallView | null = null;
let soundKey: string | undefined;
let silencedKey: string | undefined;
let stopPlayer: (() => void) | undefined;
let revision = 0;
let backgroundEnabled = false;
let modeQueue: Promise<void> = Promise.resolve();
let expiry: number | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let nativeToneKey: string | undefined;
let nativeDeadline = 0;
const keyFor = (call: CallView) =>
  `${call.incoming ? 'incoming' : 'outgoing'}:${call.incoming ? call.callId : call.participantId}`;

function stopTone() {
  revision++;
  const stop = stopPlayer;
  stopPlayer = undefined;
  soundKey = undefined;
  nativeToneKey = undefined;
  try {
    stop?.();
  } catch {
    /* Tone disposal must not interrupt call signaling. */
  }
}

function queueBackgroundMode(enabled: boolean) {
  modeQueue = modeQueue
    .then(async () => {
      // A call can be answered or cancelled while the earlier mode request waits in the queue.
      if (enabled && !soundKey) return;
      if (
        !enabled &&
        current &&
        !current.ending &&
        (current.status === 'requesting' || !isTerminal(current.status))
      )
        return;
      if (backgroundEnabled === enabled) return;
      await setAudioModeAsync({
        shouldPlayInBackground: enabled,
        ...(enabled ? { interruptionMode: 'duckOthers' as const } : {}),
      });
      backgroundEnabled = enabled;
    })
    .catch(() => {
      console.warn('[calls] ringtone-audio-mode-failed');
    });
  return modeQueue;
}

export function syncCallSound(call: CallView | null) {
  current = call;
  const active = !!call && (call.status === 'requesting' || !isTerminal(call.status));
  if (!active || call?.ending) {
    stopTone();
    silencedKey = undefined;
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    expiry = undefined;
    void queueBackgroundMode(false);
    return;
  }
  const key = keyFor(call!);
  const expiresAt = call?.expiresAt ? Date.parse(call.expiresAt) : undefined;
  if (expiresAt !== expiry) {
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    expiry = expiresAt;
    if (
      expiresAt &&
      Number.isFinite(expiresAt) &&
      (call?.status === 'ringing' || call?.status === 'requesting')
    ) {
      expiryTimer = setTimeout(
        () => silenceCallSound(current?.callId),
        Math.max(0, expiresAt - Date.now()),
      );
    }
  }
  const expired = expiresAt !== undefined && expiresAt <= Date.now();
  const sound = expired || silencedKey === key ? undefined : getCallSound(call);
  if (!sound) {
    stopTone();
    return;
  }
  const native = getNativeCallTone();
  if (soundKey === key) {
    // CALL_CREATED supplies the outgoing UUID after repique already started.
    if (native && nativeToneKey)
      native.startCallTone(nativeToneKey, call!.callId ?? '', sound, expiresAt ?? nativeDeadline);
    return;
  }
  stopTone();
  soundKey = key;
  if (native) {
    nativeToneKey = `${key}:${revision}`;
    nativeDeadline = expiresAt ?? Date.now() + 60_000;
    const tone = nativeToneKey;
    stopPlayer = () => native.stopCallTone(tone);
    native.startCallTone(tone, call!.callId ?? '', sound, nativeDeadline);
    return;
  }
  const version = revision;
  void queueBackgroundMode(true).then(() => {
    if (revision !== version || soundKey !== key) return;
    try {
      stopPlayer = createCallRingtone(sound);
    } catch {
      soundKey = undefined;
      console.warn('[calls] ringtone-playback-failed');
    }
  });
}

/** Stop immediately on accept/reject/silence, including before asynchronous CALL_SYNC. */
export function silenceCallSound(callId?: string) {
  if (
    !current ||
    (callId && current.callId !== callId) ||
    (current.status !== 'requesting' && current.status !== 'ringing')
  )
    return;
  silencedKey = keyFor(current);
  stopTone();
}

/** Release tone audio on Android's main thread before WebRTC captures media. */
export async function stopCallSoundBeforeMedia() {
  stopTone();
  await getNativeCallTone()?.stopCallToneBeforeMedia();
  await modeQueue;
}
