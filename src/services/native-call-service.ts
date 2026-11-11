import { NativeModules, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type RNCallKeep from 'react-native-callkeep';
import type { AudioRoute, Events, EventsPayload } from 'react-native-callkeep';
import type { CallView } from '../state/call-session';
import { isTerminal } from '../types/call';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { finishCallPresentation } from './native-call-media';
import { getNativeIncomingCall } from './native-incoming-call';
import {
  dismissAllIncomingCallNotifications,
  dismissIncomingCallNotification,
  showIncomingCallNotification,
} from './call-notification-service';

interface CallAudioModule {
  getBuiltinOutputs(): { earpiece: boolean; speaker: boolean };
  setProximityEnabled(enabled: boolean): void;
}
export interface NativeCallSnapshot {
  ready: boolean;
  routes: AudioRoute[];
  speaker: boolean;
  route?: 'Speaker' | 'Phone' | 'Bluetooth' | 'Headset';
  canToggleSpeaker: boolean;
  changingRoute: boolean;
  error?: string;
}

const options = {
  ios: { appName: 'Messinger' },
  android: {
    alertTitle: 'Llamadas de Messinger',
    alertDescription: 'Permite el micrófono para comunicarte con tus contactos.',
    cancelButton: 'Cancelar',
    okButton: 'Continuar',
    additionalPermissions: [],
    selfManaged: true,
    foregroundService: {
      channelId: 'messinger-ongoing-calls',
      channelName: 'Llamadas en curso',
      notificationTitle: 'Llamada de Messinger en curso',
      notificationIcon: 'ic_messinger_call',
      // Phone-call service, including while the incoming call is still ringing.
      foregroundServiceType: 4,
    },
  },
};

function getCallKeep(): typeof RNCallKeep | undefined {
  if (Platform.OS !== 'android' || !NativeModules.RNCallKeep) return;
  // Load only after checking the Android native module is present.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-callkeep').default;
}
const proximity = () => requireOptionalNativeModule<CallAudioModule>('MessingerCallAudio');
const shown = new Map<
  string,
  {
    incoming: boolean;
    active: boolean;
    muted: boolean;
    routed?: boolean;
    answered?: boolean;
    uiRequested?: boolean;
    participantId?: string;
    media?: 'audio' | 'video';
    name?: string;
    expiresAt?: string;
  }
>();
const listeners = new Set<() => void>();
let current: CallView | null = null;
let setup: Promise<boolean> | undefined;
let routeVersion = 0;
let setupVersion = 0;
let snapshot: NativeCallSnapshot = {
  ready: false,
  routes: [],
  speaker: false,
  canToggleSpeaker: false,
  changingRoute: false,
};
const publish = (patch: Partial<NativeCallSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
};

async function ensureReady() {
  if (!hasNativeCalling()) return false;
  if (snapshot.ready) return true;
  if (setup) return setup;
  const version = setupVersion;
  setup = (async () => {
    const keep = getCallKeep()!;
    // Self-managed accounts are registered by Telecom without the managed-account settings dialog.
    if (Number(Platform.Version) < 26) {
      publish({ error: 'Las llamadas requieren Android 8 o posterior.' });
      return false;
    }
    await keep.setup(options);
    const ready = await keep.isConnectionServiceAvailable();
    if (version !== setupVersion) return false;
    keep.setAvailable(ready);
    keep.canMakeMultipleCalls(false);
    publish({
      ready,
      error: ready
        ? undefined
        : 'Este dispositivo no ofrece la integración de llamadas de Android.',
    });
    return ready;
  })()
    .catch(() => {
      if (version !== setupVersion) return false;
      publish({ ready: false, error: 'No se pudo activar la integración de llamadas de Android.' });
      return false;
    })
    .finally(() => {
      if (version === setupVersion) setup = undefined;
    });
  return setup;
}

function setProximity() {
  const inCall =
    !!current &&
    current.media === 'audio' &&
    !current.held &&
    current.selected &&
    (current.status === 'accepted' || current.status === 'connected');
  const phoneSelected = snapshot.routes.some((route) => route.selected && route.type === 'Phone');
  proximity()?.setProximityEnabled(inCall && phoneSelected);
}

async function refreshRoutes() {
  const keep = getCallKeep();
  const callId = current?.callId;
  if (!keep || !snapshot.ready || !callId || !current?.selected || !current.local) return;
  const version = ++routeVersion;
  try {
    const routes = await keep.getAudioRoutes();
    if (version !== routeVersion || current?.callId !== callId) return;
    const builtins = proximity()?.getBuiltinOutputs();
    publish({
      routes,
      route: routes.find((route) => route.selected)?.type as NativeCallSnapshot['route'],
      speaker: routes.some((route) => route.type === 'Speaker' && route.selected),
      canToggleSpeaker:
        !!builtins?.earpiece &&
        !!builtins.speaker &&
        routes.some((route) => route.type === 'Phone') &&
        routes.some((route) => route.type === 'Speaker'),
    });
    setProximity();
  } catch {
    /* A ringing connection may not have an audio route yet. */
  }
}

async function toggleSpeaker() {
  const keep = getCallKeep();
  const callId = current?.callId;
  if (!keep || !callId || !snapshot.canToggleSpeaker || snapshot.changingRoute) return;
  publish({ changingRoute: true, error: undefined });
  try {
    const next = snapshot.speaker ? 'Phone' : 'Speaker';
    await keep.setAudioRoute(callId, next);
    if (current?.callId === callId) await refreshRoutes();
  } catch {
    if (current?.callId === callId)
      publish({ error: 'No se pudo cambiar entre altavoz y auricular.' });
  } finally {
    if (current?.callId === callId) publish({ changingRoute: false });
  }
}

async function initialAudioRoute(call: CallView) {
  const keep = getCallKeep();
  const id = call.callId;
  if (!keep || !id) return;
  const version = setupVersion;
  publish({ changingRoute: true });
  try {
    const routes = await keep.getAudioRoutes();
    if (current?.callId !== id || !current.selected || version !== setupVersion) return;
    if (
      !routes.some(
        (route) => route.selected && (route.type === 'Bluetooth' || route.type === 'Headset'),
      )
    ) {
      const builtins = proximity()?.getBuiltinOutputs();
      const target = call.media === 'video' || !builtins?.earpiece ? 'Speaker' : 'Phone';
      if (routes.some((route) => route.type === target)) await keep.setAudioRoute(id, target);
    }
    if (current?.callId === id) await refreshRoutes();
  } catch {
    if (current?.callId === id) await refreshRoutes();
  } finally {
    if (current?.callId === id && version === setupVersion) publish({ changingRoute: false });
  }
}

function displayIncoming(
  callId: string,
  participantId: string,
  media: 'audio' | 'video',
  name = 'Contacto',
  expiresAt?: string,
) {
  const keep = getCallKeep();
  if (!snapshot.ready || !keep || shown.has(callId)) return;
  const deadline = expiresAt ? Date.parse(expiresAt) : Date.now() + 60_000;
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
  // Hand off before Telecom can request its UI. This survives completion of the Expo headless task.
  getNativeIncomingCall()?.prepareIncomingCall?.(callId, participantId, media, name, deadline);
  shown.set(callId, {
    incoming: true,
    active: false,
    muted: false,
    participantId,
    media,
    name,
    expiresAt,
  });
  keep.displayIncomingCall(
    callId,
    participantId || 'Messinger',
    name,
    'generic',
    media === 'video',
  );
}

/** Telecom authorizes presentation with showIncomingCallUi; the app supplies the notification. */
function showIncomingUi(id: string) {
  const native = shown.get(id);
  if (!native?.incoming || native.answered) return;
  if (
    current?.callId === id &&
    (current.answering || (current.status !== 'ringing' && current.status !== 'requesting'))
  )
    return;
  native.uiRequested = true;
  showIncomingCallNotification({
    callId: id,
    callerId: native.participantId ?? '',
    name: native.name ?? 'Contacto',
    media: native.media ?? 'audio',
    expiresAt: native.expiresAt,
  });
}

function answer(id: string) {
  const native = shown.get(id);
  if (!native || native.answered) return;
  native.answered = true;
  dismissIncomingCallNotification(id);
  getCallKeep()?.answerIncomingCall(id);
}

function sync(call: CallView | null) {
  current = call;
  const keep = getCallKeep();
  const id = call?.callId;
  if (!call || !id || !keep || !snapshot.ready) {
    setProximity();
    return;
  }
  const terminal = call.status !== 'requesting' && isTerminal(call.status);
  if (call.answering || (call.status !== 'requesting' && call.status !== 'ringing'))
    dismissIncomingCallNotification(id);
  if (terminal || (!call.selected && call.status !== 'requesting' && call.status !== 'ringing')) {
    finishCallPresentation(id);
    if (shown.has(id)) {
      shown.delete(id);
      keep.reportEndCallWithUUID(
        id,
        !terminal ? 4 : call.status === 'missed' ? 3 : call.status === 'failed' ? 1 : 2,
      );
    }
    routeVersion++;
    publish({ routes: [], route: undefined, canToggleSpeaker: false, changingRoute: false });
    setProximity();
    return;
  }
  if (call.incoming && call.status === 'ringing')
    displayIncoming(id, call.participantId, call.media, 'Contacto', call.expiresAt ?? undefined);
  if (!call.incoming && !shown.has(id)) {
    shown.set(id, { incoming: false, active: false, muted: false });
    keep.startCall(id, call.participantId, 'Contacto', 'generic', call.media === 'video');
  }
  const native = shown.get(id);
  if (
    native &&
    call.incoming &&
    call.selected &&
    (call.status === 'accepted' || call.status === 'connected')
  )
    answer(id);
  if (native?.uiRequested && call.status === 'ringing' && !call.answering) {
    native.expiresAt = call.expiresAt ?? undefined;
    native.media = call.media;
    native.participantId = call.participantId;
    showIncomingUi(id);
  }
  if (native && call.status === 'connected' && !native.active) {
    native.active = true;
    keep.setCurrentCallActive(id);
    void refreshRoutes();
  }
  if (native && native.muted !== call.muted) {
    native.muted = call.muted;
    keep.setMutedCall(id, call.muted);
  }
  if (call.selected && call.local && native && !native.routed) {
    native.routed = true;
    void initialAudioRoute(call);
  } else if (call.selected && call.local) void refreshRoutes();
  setProximity();
}

function on<E extends Events>(event: E, handler: (data: EventsPayload[E]) => void) {
  return getCallKeep()?.addEventListener(event, handler);
}

function clear() {
  const keep = getCallKeep();
  for (const id of shown.keys()) {
    finishCallPresentation(id);
    keep?.reportEndCallWithUUID(id, 2);
  }
  shown.clear();
  dismissAllIncomingCallNotifications();
  current = null;
  routeVersion++;
  setupVersion++;
  setup = undefined;
  proximity()?.setProximityEnabled(false);
  publish({
    ready: false,
    routes: [],
    route: undefined,
    speaker: false,
    canToggleSpeaker: false,
    changingRoute: false,
    error: undefined,
  });
  keep?.setAvailable(false);
}

export const nativeCallService = {
  ensureReady,
  displayIncoming,
  showIncomingUi,
  sync,
  refreshRoutes,
  toggleSpeaker,
  on,
  clear,
  hasCall: (id: string) => shown.has(id),
  adopt: (id: string, incoming: boolean) => {
    if (!shown.has(id))
      shown.set(id, { incoming, active: false, muted: false, answered: incoming });
  },
  answer,
  foreground: () => getCallKeep()?.backToForeground(),
  updateName: (id: string, name: string, participantId: string) => {
    const native = shown.get(id);
    if (native) {
      native.name = name;
      native.participantId = participantId;
      getCallKeep()?.updateDisplay(id, name, participantId);
      if (native.uiRequested) showIncomingUi(id);
    }
  },
  initialEvents: () => getCallKeep()?.getInitialEvents(),
  reachable: () => getCallKeep()?.setReachable(),
  clearInitialEvents: () => getCallKeep()?.clearInitialEvents(),
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
