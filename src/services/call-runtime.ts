import { getNativeIncomingCall } from './native-incoming-call';
import { AppState, Platform } from 'react-native';
import { createCallClient } from '../clients/call-client';
import { wsClient } from '../clients/websocket-client';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { tokenStorage } from '../token-storage';
import { isTerminal } from '../types/call';
import { dismissIncomingCallNotification } from './call-notification-service';
import { isExpiredCallPush } from './call-push';
import { silenceCallSound, syncCallSound } from './call-sound-service';
import { nativeCallService } from './native-call-service';
import { setCallInProgress } from './notification-state';
import type { CallPush } from './call-push';

export const callClient = createCallClient();
let unmount: (() => void) | undefined;
let activeUser: string | undefined;
let authVersion = 0;
const responseIntents = new Map<string, 'accept' | 'reject'>();

export function hasActiveCall() {
  const call = callClient.getSnapshot();
  return !!call && (call.status === 'requesting' || !isTerminal(call.status));
}
async function ensureCallConnection() {
  const version = authVersion;
  if (!(await tokenStorage.getAccessToken()) || version !== authVersion)
    throw new Error('Inicia sesión para atender la llamada.');
  const url = process.env.EXPO_PUBLIC_WEB_SOCKET_URL;
  if (!url) throw new Error('No se configuró la conexión de llamadas.');
  startCallRuntime();
  wsClient.connect(url);
}
/** Called only by an explicit user action in React or a notification response. */
export async function respondToCall(
  callId: string,
  action: 'accept' | 'reject',
  expiresAt?: string,
) {
  callId = callId.toLowerCase();
  if (action === 'accept' && responseIntents.get(callId) === 'reject') return;
  responseIntents.set(callId, action);
  if (responseIntents.size > 128) responseIntents.delete(responseIntents.keys().next().value!);
  if (action === 'accept') nativeCallService.answer(callId);
  silenceCallSound(callId);
  dismissIncomingCallNotification(callId);
  try {
    await ensureCallConnection();
    if (responseIntents.get(callId) !== action) return;
    if (action === 'accept') callClient.answerFromNotification(callId, expiresAt);
    else callClient.rejectFromNotification(callId, expiresAt);
  } catch (error) {
    nativeCallService.reportError(error);
  }
}
export function startCallRuntime() {
  if (Platform.OS !== 'android' || unmount) return;
  const detach = callClient.mount();
  // A headless call store can already be closed after foreground handoff. Remote end is global.
  const remoteEnd = wsClient.on('CALL_END', ({ callId }) => nativeCallService.endRemote(callId));
  const remoteReject = wsClient.on('CALL_REJECT', ({ callId }) =>
    nativeCallService.endRemote(callId),
  );
  const remoteState = wsClient.on('CALL_STATE', ({ call }) => {
    if (call.isTerminal) nativeCallService.endRemote(call.callId);
  });
  const unsubscribe = callClient.subscribe(() => {
    const call = callClient.getSnapshot();
    syncCallSound(call);
    setCallInProgress(hasActiveCall());
    nativeCallService.sync(call);
    if (!hasActiveCall() && AppState.currentState !== 'active') wsClient.disconnect();
  });
  unmount = () => {
    remoteEnd();
    remoteReject();
    remoteState();
    unsubscribe();
    detach();
    unmount = undefined;
  };
}
export function setCallUser(userId?: string) {
  if (activeUser && activeUser !== userId) stopCallRuntime();
  activeUser = userId;
  getNativeIncomingCall()?.setCallPushUser?.(userId ?? null);
  if (userId) startCallRuntime();
}
export function stopCallRuntime() {
  getNativeIncomingCall()?.setCallPushUser?.(null);
  authVersion++;
  activeUser = undefined;
  callClient.end();
  unmount?.();
  syncCallSound(null);
  nativeCallService.clear();
  callClient.dismiss();
  responseIntents.clear();
  setCallInProgress(false);
}
export const getCallUser = () => activeUser;
export async function receiveCallPush(push: CallPush) {
  const version = authVersion;
  if (!hasNativeCalling()) return;
  if (isExpiredCallPush(push) || push.type === 'call-missed') {
    if (push.type === 'call-missed') nativeCallService.endRemote(push.callId);
    dismissIncomingCallNotification(push.callId);
    if (callClient.getSnapshot()?.callId === push.callId && hasActiveCall())
      callClient.inspectFromNotification(push.callId);
    return;
  }
  if (responseIntents.has(push.callId)) return;
  if (!(await tokenStorage.getAccessToken()) || version !== authVersion) return;
  if (hasActiveCall() && callClient.getSnapshot()?.callId !== push.callId) return;
  if (!(await nativeCallService.ensureReady()) || version !== authVersion) return;
  startCallRuntime();
  callClient.inspectFromNotification(push.callId, {
    participantId: push.callerId,
    media: push.media,
    expiresAt: push.expiresAt,
  });
  const current = callClient.getSnapshot();
  if (
    !current ||
    current.callId !== push.callId ||
    (current.status !== 'requesting' && isTerminal(current.status))
  )
    return;
  // Presentation starts before the network handshake; fresh server state can terminate a stale push.
  await nativeCallService.displayIncoming(
    push.callId,
    push.callerId,
    push.media,
    'Contacto',
    push.expiresAt,
  );
  try {
    await ensureCallConnection();
  } catch (error) {
    nativeCallService.reportError(error);
  }
}
