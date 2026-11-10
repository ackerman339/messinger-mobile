import { AppState, Platform } from 'react-native';
import { createCallClient } from '../clients/call-client';
import { wsClient } from '../clients/websocket-client';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { tokenStorage } from '../token-storage';
import { isTerminal } from '../types/call';
import { isExpiredCallPush } from './call-push';
import { nativeCallService } from './native-call-service';

import type { CallPush } from './call-push';

// One session for foreground React, headless notifications and Telecom actions.
export const callClient = createCallClient();
let unmount: (() => void) | undefined;
let stopNativeEvents: (() => void) | undefined;
let activeUser: string | undefined;
let authVersion = 0;
let suppressNativeEnd = false;
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

export async function respondToCall(callId: string, action: 'accept' | 'reject') {
  callId = callId.toLowerCase();
  if (action === 'accept' && responseIntents.get(callId) === 'reject') return;
  responseIntents.set(callId, action);
  if (responseIntents.size > 128) responseIntents.delete(responseIntents.keys().next().value!);
  try {
    await ensureCallConnection();
    if (responseIntents.get(callId) !== action) return;
    if (action === 'accept') {
      nativeCallService.foreground();
      callClient.answerFromNotification(callId.toLowerCase());
    } else callClient.rejectFromNotification(callId.toLowerCase());
  } catch {
    nativeCallService.clear();
  }
}

function onNativeEnd(callId: string) {
  if (suppressNativeEnd) return;
  const call = callClient.getSnapshot();
  if (call?.callId === callId && call.status !== 'requesting' && isTerminal(call.status)) return;
  responseIntents.set(callId, 'reject');
  if (call?.callId === callId && call.status !== 'requesting')
    callClient.end(call.incoming && call.status === 'ringing');
  else void respondToCall(callId, 'reject');
}

/** Bind before the Router mounts so native answer/end events are not lost on a cold start. */
export function bindNativeCallEvents() {
  if (stopNativeEvents || !hasNativeCalling()) return;
  const subscriptions = [
    nativeCallService.on('answerCall', ({ callUUID }) => {
      nativeCallService.adopt(callUUID.toLowerCase(), true);
      void respondToCall(callUUID, 'accept');
    }),
    nativeCallService.on('endCall', ({ callUUID }) => onNativeEnd(callUUID.toLowerCase())),
    nativeCallService.on('didPerformSetMutedCallAction', ({ callUUID, muted }) => {
      const call = callClient.getSnapshot();
      if (call?.callId === callUUID.toLowerCase() && call.muted !== muted)
        callClient.toggle('audio');
    }),
    nativeCallService.on('didToggleHoldCallAction', ({ callUUID, hold }) => {
      if (callClient.getSnapshot()?.callId === callUUID.toLowerCase()) callClient.setHeld(hold);
    }),
    nativeCallService.on('didChangeAudioRoute', () => {
      void nativeCallService.refreshRoutes();
    }),
    nativeCallService.on('didActivateAudioSession', () => {
      void nativeCallService.refreshRoutes();
    }),
    nativeCallService.on('checkReachability', () => {
      // CallKeep's managed account is reachable while this JS runtime handles its events.
      nativeCallService.reachable();
    }),
    nativeCallService.on('createIncomingConnectionFailed', ({ callUUID }) => {
      if (callClient.getSnapshot()?.callId === callUUID.toLowerCase())
        void respondToCall(callUUID, 'reject');
    }),
    nativeCallService.on('startCallFailed', ({ callUUID }) => {
      if (callClient.getSnapshot()?.callId === callUUID.toLowerCase()) callClient.end();
    }),
  ];
  stopNativeEvents = () => {
    subscriptions.forEach((subscription) => subscription?.remove());
    stopNativeEvents = undefined;
  };
  const version = authVersion;
  void nativeCallService
    .initialEvents()
    ?.then((events) => {
      if (version !== authVersion) return;
      for (const event of events) {
        if (event.name === 'RNCallKeepPerformAnswerCallAction') {
          nativeCallService.adopt(event.data.callUUID.toLowerCase(), true);
          void respondToCall(event.data.callUUID, 'accept');
        }
        if (event.name === 'RNCallKeepPerformEndCallAction')
          onNativeEnd(event.data.callUUID.toLowerCase());
      }
      nativeCallService.clearInitialEvents();
    })
    .catch(() => {});
}

export function startCallRuntime() {
  if (Platform.OS !== 'android' || unmount) return;
  bindNativeCallEvents();
  const detachEvents = callClient.mount();
  const unsubscribe = callClient.subscribe(() => {
    const call = callClient.getSnapshot();
    nativeCallService.sync(call);
    if (!hasActiveCall() && AppState.currentState !== 'active') wsClient.disconnect();
  });
  unmount = () => {
    unsubscribe();
    detachEvents();
    unmount = undefined;
  };
}

export function setCallUser(userId?: string) {
  if (activeUser && userId !== activeUser) stopCallRuntime();
  activeUser = userId;
  if (userId) startCallRuntime();
}

export function stopCallRuntime() {
  authVersion++;
  activeUser = undefined;
  suppressNativeEnd = true;
  try {
    callClient.end();
    unmount?.();
    stopNativeEvents?.();
    nativeCallService.clear();
    callClient.dismiss();
    responseIntents.clear();
  } finally {
    suppressNativeEnd = false;
  }
}

export const getCallUser = () => activeUser;

export async function receiveCallPush(push: CallPush) {
  const version = authVersion;
  if (!hasNativeCalling() || isExpiredCallPush(push)) return;
  if (!(await tokenStorage.getAccessToken()) || version !== authVersion) return;
  await ensureCallConnection();
  if (version !== authVersion) return;
  if (push.type === 'call-missed') {
    if (callClient.getSnapshot()?.callId === push.callId && hasActiveCall())
      callClient.inspectFromNotification(push.callId);
    return;
  }
  if (hasActiveCall() && callClient.getSnapshot()?.callId !== push.callId) return;
  // Inspect first: an old push must not ring again after this session ended locally.
  callClient.inspectFromNotification(push.callId);
  const ready = await nativeCallService.ensureReady();
  if (version !== authVersion) return;
  const call = callClient.getSnapshot();
  if (!ready || call?.callId !== push.callId || !call.incoming) return;
  if (call.status === 'ringing') nativeCallService.sync(call);
  else if (call.status === 'requesting')
    nativeCallService.displayIncoming(push.callId, push.callerId, push.media);
}
