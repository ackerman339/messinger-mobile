import { useEffect } from 'react';
import { setCallPanelVisible } from '../services/native-call-media';

export function useCallPanelVisibility(callId?: string) {
  useEffect(() => {
    if (!callId) return;
    setCallPanelVisible(callId, true);
    return () => setCallPanelVisible(callId, false);
  }, [callId]);
}
