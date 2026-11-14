import { wsClient } from '@/src/clients/websocket-client';
import { randomUUID } from 'expo-crypto';
import type { CallView, CallSession as Session } from '../state/call-session';
import { createCallSession } from '../state/call-session';
import type { CallStore } from '../state/call-store';
import type { CallMedia, CallStatus } from '../types/call';
import { releaseChatRecorderForCall } from './call-audio-ownership';
import { requestCallPermissions } from './call-permissions';
import { startCallMedia } from './native-call-media';
export function createCallLifecycle(store: CallStore) {
  function start(
    participantId: string,
    media: CallMedia,
    callerName?: string,
    conversationId?: string,
  ) {
    const current = store.getSession();
    if (current && !current.closed) {
      return;
    }
    const session = createCallSession(
      {
        conversationId,
        participantId,
        media,
        incoming: false,
        status: 'requesting',
        selected: true,
        muted: false,
        cameraOff: false,
      },
      randomUUID(),
    );
    store.setSession(session);
    store.publish(session);
    session.callerName = callerName?.trim().slice(0, 100) || undefined;
    wsClient.emit('CALL_INIT', {
      ...(session.view.conversationId
        ? { conversationId: session.view.conversationId }
        : {}),
      requestId: session.requestId!,
      calleeId: participantId,
      media,
      callerName: session.callerName,
    });
  }

  function respondFromNotification(
    callId: string,
    action?: 'accept' | 'reject',
    incoming?: Partial<
      Pick<
        CallView,
        'participantId' | 'participantName' | 'media' | 'expiresAt'
      >
    >,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        callId,
      )
    )
      return;
    if (store.terminalIds.has(callId)) return;
    let session = store.getSession();
    if (session && !session.closed) {
      if (session.view.callId !== callId || !session.view.incoming) return;
      if (
        session.view.status !== 'ringing' &&
        session.view.status !== 'requesting'
      )
        return;
      if (session.notificationAction) {
        if (action === 'reject') session.notificationAction = 'reject';
        return;
      }
      if (session.notificationResponseSent) return;
    } else {
      session = createCallSession({
        callId,
        participantId: '',
        media: 'audio',
        incoming: true,
        status: 'requesting',
        selected: false,
        muted: false,
        cameraOff: false,
        notice: 'Consultando la llamada…',
      });
      store.setSession(session);
    }
    // Notification actions use fresh server state before accepting or rejecting.
    session.notificationAction = action;
    const expiresAt = incoming?.expiresAt ?? session.view.expiresAt;
    session.notificationResponseDeadline = action
      ? Date.now() + 60_000
      : expiresAt
        ? Date.parse(expiresAt)
        : Date.now() + 60_000;
    store.publish(session, {
      ...incoming,
      answering: !!action,
      notice:
        action === 'reject'
          ? 'Rechazando llamada…'
          : action === 'accept'
            ? 'Atendiendo llamada…'
            : 'Consultando llamada…',
    });
    sync(session);
  }

  function inspectFromNotification(
    callId: string,
    incoming?: Pick<
      CallView,
      'participantId' | 'participantName' | 'media' | 'expiresAt'
    >,
  ) {
    respondFromNotification(callId, undefined, incoming);
  }

  function answerFromNotification(callId: string, expiresAt?: string) {
    respondFromNotification(
      callId,
      'accept',
      expiresAt ? { expiresAt } : undefined,
    );
  }

  function rejectFromNotification(callId: string, expiresAt?: string) {
    respondFromNotification(
      callId,
      'reject',
      expiresAt ? { expiresAt } : undefined,
    );
  }

  async function accept() {
    const session = store.getSession();
    if (
      session &&
      store.live(session) &&
      session.view.callId &&
      session.view.status === 'ringing'
    ) {
      try {
        await releaseChatRecorderForCall();
        await requestCallPermissions(session.view.media, true);
        if (store.live(session) && session.view.status === 'ringing') {
          if (
            session.view.expiresAt &&
            Date.parse(session.view.expiresAt) <= Date.now()
          ) {
            finish(session, 'missed', 'La llamada ya expiró.');
            return;
          }
          // Establish microphone eligibility while the user-facing activity is visible.
          await startCallMedia(session.view.callId, session.view.media);
          if (store.live(session) && session.view.status === 'ringing')
            wsClient.emit('CALL_ACCEPT', { callId: session.view.callId });
        }
      } catch (error) {
        if (store.live(session)) fail(session, error);
      }
    }
  }

  function end(reject = false) {
    const session = store.getSession();
    if (!session || session.closed) {
      return;
    }
    session.cancelled = true;
    cleanup(session);
    if (session.view.callId) {
      wsClient.emit(reject ? 'CALL_REJECT' : 'CALL_END', {
        callId: session.view.callId,
      });
      finish(session, reject ? 'rejected' : 'ended');
    } else {
      store.publish(session, { ending: true, notice: 'Cancelando llamada…' });
      sync(session);
    }
  }

  function toggle(kind: 'audio' | 'video') {
    const session = store.getSession();
    if (!session || !store.live(session)) {
      return;
    }
    if (session.view.held) {
      store.publish(
        session,
        kind === 'audio'
          ? { muted: !session.view.muted }
          : { cameraOff: !session.view.cameraOff },
      );
      return;
    }
    const enabled = session.rtc.toggle(kind);
    if (enabled === undefined) {
      return;
    }
    store.publish(
      session,
      kind === 'audio' ? { muted: !enabled } : { cameraOff: !enabled },
    );
  }

  function setHeld(held: boolean) {
    const session = store.getSession();
    if (!session || !store.live(session) || !session.view.selected) return;
    session.rtc.local?.getTracks().forEach((track) => {
      track.enabled =
        !held &&
        (track.kind === 'audio'
          ? !session.view.muted
          : !session.view.cameraOff);
    });
    store.publish(session, { held });
  }

  async function switchCamera() {
    const session = store.getSession();
    if (
      !session ||
      !store.live(session) ||
      !session.view.selected ||
      session.view.media !== 'video' ||
      !session.view.local ||
      session.view.switchingCamera
    )
      return;
    store.publish(session, { switchingCamera: true, deviceError: undefined });
    try {
      const frontCamera = await session.rtc.switchCamera();
      if (store.live(session)) store.publish(session, { frontCamera });
    } catch (error) {
      if (store.live(session))
        store.publish(session, {
          deviceError:
            error instanceof Error
              ? error.message
              : 'No se pudo cambiar de cámara.',
        });
    } finally {
      if (store.live(session))
        store.publish(session, { switchingCamera: false });
    }
  }

  function sync(session: Session) {
    if (session.closed) {
      return;
    }
    session.syncId = randomUUID();
    session.nextSync = Date.now() + 5000;
    if (session.view.callId) {
      wsClient.emit('CALL_SYNC', {
        syncId: session.syncId,
        callId: session.view.callId,
      });
    } else {
      if (session.requestId) {
        wsClient.emit('CALL_SYNC', {
          syncId: session.syncId,
          requestId: session.requestId,
        });
      }
    }
  }

  function tick() {
    const session = store.getSession();
    if (!session || session.closed) {
      return;
    }
    const now = Date.now();
    if (
      session.view.incoming &&
      (session.view.status === 'ringing' ||
        session.view.status === 'requesting') &&
      session.view.expiresAt &&
      now >= Date.parse(session.view.expiresAt)
    ) {
      finish(session, 'missed', 'La llamada ya expiró.');
      return;
    }
    if (
      (session.notificationAction ||
        (session.view.status === 'requesting' && session.view.incoming)) &&
      session.notificationResponseDeadline &&
      now >= session.notificationResponseDeadline
    ) {
      session.notificationAction = undefined;
      if (session.view.status === 'requesting') {
        finish(session, 'failed', 'No se pudo consultar la llamada.');
        return;
      }
      store.publish(session, {
        answering: false,
        notice: 'No se pudo confirmar la llamada. Puedes volver a intentarlo.',
      });
    }
    if (now >= session.nextSync) {
      if (
        !session.view.incoming &&
        session.view.status === 'requesting' &&
        !session.cancelled &&
        session.requestId
      ) {
        // The first event may precede the native socket's authentication handshake.
        session.nextSync = now + 5000;
        wsClient.emit('CALL_INIT', {
          ...(session.view.conversationId
            ? { conversationId: session.view.conversationId }
            : {}),
          requestId: session.requestId,
          calleeId: session.view.participantId,
          media: session.view.media,
          callerName: session.callerName,
        });
      } else sync(session);
    }
    if (
      session.view.status === 'ringing' &&
      !session.view.incoming &&
      session.view.selected &&
      session.view.expiresAt &&
      now >= Date.parse(session.view.expiresAt) &&
      !session.timeoutSent
    ) {
      session.timeoutSent = true;
      wsClient.emit('CALL_TIMEOUT', { callId: session.view.callId! });
      sync(session);
    }
    if (!store.live(session) || !session.negotiation) {
      return;
    }
    const result = session.delivery.retry(
      session.view.callId!,
      session.negotiation.negotiationId,
      now,
      session.negotiation.expiresAt ?? session.deadline,
    );
    if (result === 'exhausted') {
      store.publish(session, {
        error: 'No se confirmó la entrega de la señal. Consultando el estado.',
      });
    }
    if (result) {
      sync(session);
    }
  }

  function cleanup(session: Session) {
    session.delivery.clear();
    session.candidates.clear();
    session.rtc.close();
  }

  function finish(
    session: Session,
    status: CallStatus = 'ended',
    notice?: string,
  ) {
    if (session.closed) {
      return;
    }
    session.closed = true;
    if (session.view.callId) {
      store.terminalIds.add(session.view.callId);
    }
    cleanup(session);
    store.publish(session, {
      status,
      notice,
      local: undefined,
      remote: undefined,
      selected: false,
      answering: false,
      switchingCamera: false,
      deviceError: undefined,
    });
  }

  function fail(session: Session, error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo establecer la llamada';
    store.publish(session, { error: message });
    if (session.view.status !== 'connected') {
      if (session.view.callId) {
        wsClient.emit('CALL_END', { callId: session.view.callId });
      }
      finish(session, 'failed');
    } else {
      sync(session);
    }
  }
  return {
    start,
    accept,
    inspectFromNotification,
    answerFromNotification,
    rejectFromNotification,
    end,
    toggle,
    switchCamera,
    setHeld,
    sync,
    tick,
    cleanup,
    finish,
    fail,
  };
}
export type CallLifecycle = ReturnType<typeof createCallLifecycle>;
