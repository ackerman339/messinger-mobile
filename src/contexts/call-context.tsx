import { createContext, useContext } from 'react';
import type { CallMedia } from '../types/call';
import type { CallView } from '../state/call-session';
import type { NativeCallSnapshot } from '../services/native-call-service';

export interface CallContextValue {
  call: CallView | null;
  native: NativeCallSnapshot;
  starting: boolean;
  handleStartCall: (participantId: string, media: CallMedia) => void;
  handleAcceptCall: () => void;
  handleRejectCall: () => void;
  handleEndCall: () => void;
  handleDismissCall: () => void;
  handleToggleMicrophone: () => void;
  handleToggleCamera: () => void;
  handleSwitchCamera: () => void;
  handleToggleSpeaker: () => void;
}
export const CallContext = createContext<CallContextValue | undefined>(undefined);
export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCallContext must be used within CallProvider');
  return context;
}
