import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { isTerminal } from '../types/call';
import {
  showIncomingCallNotification,
  dismissAllIncomingCallNotifications,
} from './call-notification-service';
import type { CallView } from '../state/call-session';
import type { CallPush } from './call-push';

export type AudioRoute = {
  name: string;
  type: 'Speaker' | 'Phone' | 'Bluetooth' | 'Headset';
  selected: boolean;
};
export interface NativeCallSnapshot {
  ready: boolean;
  routes: AudioRoute[];
  speaker: boolean;
  route?: AudioRoute['type'];
  canToggleSpeaker: boolean;
  changingRoute: boolean;
  error?: string;
}
interface CallAudio {
  getCallFlowVersion(): number;
  getIncomingCall(): CallPush | null;
  acceptIncomingCall(id: string): void;
  presentOutgoingCall(
    id: string,
    caller: string,
    media: string,
    name: string,
    expires: number,
  ): Promise<void>;
  finishCallPresentation(id: string, remote: boolean): void;
  clearCalls(): void;
  getAudioRoutes(): Promise<AudioRoute[]>;
  setAudioRoute(route: string): Promise<void>;
  setProximityEnabled(enabled: boolean): void;
  addListener(event: string, listener: () => void): { remove(): void };
}
const audio = () => {
  const native = requireOptionalNativeModule<Partial<CallAudio>>('MessingerCallAudio');
  return native?.getCallFlowVersion?.() === 2 ? native : undefined;
};
const listeners = new Set<() => void>();
const answered = new Set<string>();
const outgoing = new Set<string>();
const names = new Map<string, string>();
let current: CallView | null = null;
let pendingOutgoing: string | undefined;
let routeListener: { remove(): void } | undefined;
let snapshot: NativeCallSnapshot = {
  ready: false,
  routes: [],
  speaker: false,
  canToggleSpeaker: false,
  changingRoute: false,
};
function publish(patch: Partial<NativeCallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}
function reportError(error: unknown) {
  publish({
    error: error instanceof Error ? error.message : 'No se pudo preparar la llamada en Android.',
  });
}
async function ensureReady() {
  const native = audio();
  const ready =
    Platform.OS === 'android' &&
    Number(Platform.Version) >= 26 &&
    native?.getCallFlowVersion?.() === 2;
  publish({
    ready,
    error: ready ? undefined : 'Instala el APK nuevo con el servicio de llamadas de Android.',
  });
  if (ready && !routeListener && native?.addListener)
    routeListener = native.addListener('onCallAudioRoutesChanged', () => void refreshRoutes());
  return ready;
}
async function refreshRoutes() {
  const call = current;
  if (!call?.selected || !call.local || !snapshot.ready) return;
  try {
    const routes = (await audio()?.getAudioRoutes?.()) ?? [];
    if (current?.callId !== call.callId) return;
    const route = routes.find((item) => item.selected)?.type;
    publish({
      routes,
      route,
      speaker: route === 'Speaker',
      canToggleSpeaker:
        routes.some((item) => item.type === 'Phone') &&
        routes.some((item) => item.type === 'Speaker'),
    });
    audio()?.setProximityEnabled?.(call.media === 'audio' && !call.held && route === 'Phone');
  } catch (error) {
    reportError(error);
  }
}
async function toggleSpeaker() {
  if (!snapshot.canToggleSpeaker || snapshot.changingRoute) return;
  publish({ changingRoute: true });
  try {
    await audio()?.setAudioRoute?.(snapshot.speaker ? 'Phone' : 'Speaker');
    await refreshRoutes();
  } catch (error) {
    reportError(error);
  } finally {
    publish({ changingRoute: false });
  }
}
function displayIncoming(
  id: string,
  caller: string,
  media: 'audio' | 'video',
  name = 'Contacto',
  expiresAt?: string,
) {
  if (answered.has(id)) return;
  return showIncomingCallNotification({ callId: id, callerId: caller, media, name, expiresAt });
}
function answer(id: string) {
  if (answered.has(id)) return;
  answered.add(id);
  audio()?.acceptIncomingCall?.(id);
}
function sync(call: CallView | null) {
  const previousId = current?.callId;
  current = call;
  if (call?.callId && call.callId !== previousId) publish({ error: undefined });
  if (call?.ending && pendingOutgoing) {
    audio()?.finishCallPresentation?.(pendingOutgoing, false);
    pendingOutgoing = undefined;
  }
  if (!call?.callId) return;
  if (!snapshot.ready) {
    void ensureReady().then((ready) => {
      if (ready && current === call) sync(call);
    });
    return;
  }
  const id = call.callId;
  if (call.status !== 'requesting' && isTerminal(call.status)) {
    if (pendingOutgoing && !call.incoming)
      audio()?.finishCallPresentation?.(pendingOutgoing, false);
    pendingOutgoing = undefined;
    // A headless socket losing selection must not end media owned by the foreground runtime.
    audio()?.finishCallPresentation?.(id, call.remoteEnded === true);
    answered.delete(id);
    outgoing.delete(id);
    names.delete(id);
    audio()?.setProximityEnabled?.(false);
    publish({ routes: [], route: undefined, speaker: false, canToggleSpeaker: false });
    return;
  }
  if (call.incoming && call.status === 'ringing' && !call.answering)
    displayIncoming(id, call.participantId, call.media, names.get(id), call.expiresAt ?? undefined);
  if (!call.incoming && !outgoing.has(id)) {
    outgoing.add(id);
    void audio()
      ?.presentOutgoingCall?.(
        id,
        call.participantId,
        call.media,
        names.get(id) ?? 'Contacto',
        call.expiresAt ? Date.parse(call.expiresAt) : Date.now() + 60_000,
      )
      .catch(reportError);
  }
  if (call.incoming && call.selected && (call.status === 'accepted' || call.status === 'connected'))
    answer(id);
  if (call.local && call.selected) void refreshRoutes();
}
function clear() {
  audio()?.clearCalls?.();
  audio()?.setProximityEnabled?.(false);
  dismissAllIncomingCallNotifications();
  answered.clear();
  outgoing.clear();
  names.clear();
  current = null;
  pendingOutgoing = undefined;
  routeListener?.remove();
  routeListener = undefined;
  publish({
    ready: false,
    routes: [],
    route: undefined,
    speaker: false,
    canToggleSpeaker: false,
    changingRoute: false,
  });
}
export const nativeCallService = {
  ensureReady,
  displayIncoming,
  answer,
  sync,
  refreshRoutes,
  toggleSpeaker,
  clear,
  reportError,
  getIncoming: () => audio()?.getIncomingCall?.() ?? null,
  endRemote(id: string) {
    audio()?.finishCallPresentation?.(id, true);
  },
  async beginOutgoing(participant: string, media: 'audio' | 'video') {
    pendingOutgoing = 'outgoing:' + Date.now() + ':' + Math.random();
    await audio()?.presentOutgoingCall?.(
      pendingOutgoing,
      participant,
      media,
      'Contacto',
      Date.now() + 60_000,
    );
  },
  updateName(id: string, name: string, participant: string) {
    if (names.get(id) === name) return;
    names.set(id, name);
    if (current?.callId === id && current.incoming && current.status === 'ringing')
      displayIncoming(id, participant, current.media, name, current.expiresAt ?? undefined);
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
