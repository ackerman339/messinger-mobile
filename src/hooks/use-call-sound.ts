import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createCallRingtone, getCallSound } from '../services/call-ringtone';
import type { CallView } from '../state/call-session';

export function useCallSound(call: CallView | null, nativeRinging: boolean) {
  const sound = getCallSound(call, nativeRinging);
  const key = call?.incoming ? call.callId : call?.participantId;
  useEffect(() => {
    if (!sound) return;
    // Telecom rings incoming calls in the background. App audio is only a foreground fallback.
    let stop: (() => void) | undefined;
    const refresh = () => {
      stop?.();
      stop = undefined;
      if (AppState.currentState === 'active') {
        try {
          stop = createCallRingtone(sound);
        } catch {
          /* Audio must not prevent receiving a call. */
        }
      }
    };
    refresh();
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      stop?.();
      subscription.remove();
    };
  }, [sound, key]);
}
