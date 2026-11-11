import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState } from 'react-native';
import type { CallView } from '../state/call-session';
import { isTerminal } from '../types/call';

let sequence = 0;
export function useCallScreenAwake(call: CallView | null) {
  const enabled =
    !!call &&
    call.media === 'video' &&
    !call.ending &&
    (call.status === 'requesting' || !isTerminal(call.status));
  useEffect(() => {
    if (!enabled) return;
    const tag = `messinger-video-${++sequence}`;
    let active = true;
    let queue = Promise.resolve();
    const sync = () => {
      queue = queue
        .then(async () => {
          if (active && AppState.currentState === 'active') await activateKeepAwakeAsync(tag);
          else await deactivateKeepAwake(tag);
        })
        .catch(() => {
          console.warn('[calls] screen-awake-failed');
        });
    };
    sync();
    const listener = AppState.addEventListener('change', sync);
    return () => {
      active = false;
      listener.remove();
      sync();
    };
  }, [enabled]);
}
