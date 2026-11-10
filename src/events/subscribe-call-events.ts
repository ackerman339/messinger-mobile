import { AppState } from 'react-native';
import { wsClient } from '@/src/clients/websocket-client';
import type { CallServerPayloads } from '../types/call';
import type { CallStore } from '../state/call-store';
import type { CallLifecycle } from '../services/call-lifecycle';
import type { createCallEventHandlers } from './call-events';
import type { createNegotiationEventHandlers } from './negotiation-events';

export function subscribeCallEvents(
  store: CallStore,
  lifecycle: CallLifecycle,
  calls: ReturnType<typeof createCallEventHandlers>,
  negotiations: ReturnType<typeof createNegotiationEventHandlers>,
) {
  const unsubscribe: (() => void)[] = [];
  function on<K extends keyof CallServerPayloads>(
    event: K,
    handler: (data: CallServerPayloads[K]) => void | Promise<void>,
  ) {
    unsubscribe.push(
      wsClient.on(event, async (data) => {
        const session = store.getSession();
        try {
          await handler(data);
        } catch (error) {
          if (session && store.live(session)) lifecycle.fail(session, error);
        }
      }),
    );
  }
  on('CALL_CREATED', calls.handleCreated);
  on('CALL_INCOMING', calls.handleIncoming);
  on('CALL_ACCEPT', calls.handleAccept);
  on('CALL_REJECT', calls.handleReject);
  on('CALL_END', calls.handleEnd);
  on('CALL_CONNECTED', calls.handleConnected);
  on('CALL_STATE', calls.handleState);
  on('CALL_NEGOTIATION_CREATED', negotiations.handleNegotiationCreated);
  on('CALL_OFFER', negotiations.handleOffer);
  on('CALL_ANSWER', negotiations.handleAnswer);
  on('CALL_SIGNAL_ACK', negotiations.handleSignalAck);
  on('CALL_ICE_CANDIDATE', negotiations.handleIceCandidate);
  on('CALL_NEGOTIATION_COMPLETED', negotiations.handleNegotiationCompleted);
  on('CALL_NEGOTIATION_END', negotiations.handleNegotiationEnd);
  unsubscribe.push(
    wsClient.on('ERROR', (data) => {
      const session = store.getSession();
      if (session && !session.closed && data?.error?.code?.includes('CALL_')) {
        if (String(data.error.code).endsWith('CALL_NOT_FOUND')) {
          if (session.view.incoming || session.cancelled)
            lifecycle.finish(session, 'ended', 'La llamada ya no está disponible.');
          return;
        }
        store.publish(session, { error: data.error.message });
        lifecycle.sync(session);
      }
    }),
  );
  const subscription = AppState.addEventListener('change', (state) => {
    const session = store.getSession();
    if (state === 'active' && session) lifecycle.sync(session);
    if (session && store.live(session) && session.view.selected && session.view.media === 'video') {
      const camera = session.rtc.local?.getVideoTracks()[0];
      if (camera)
        camera.enabled = state === 'active' && !session.view.cameraOff && !session.view.held;
    }
  });
  const timer = setInterval(lifecycle.tick, 1000);
  return () => {
    unsubscribe.forEach((off) => off());
    subscription.remove();
    clearInterval(timer);
    const session = store.getSession();
    if (session && !session.closed) {
      if (session.view.callId && session.view.selected)
        wsClient.emit('CALL_END', { callId: session.view.callId });
      lifecycle.finish(session);
    }
  };
}
