import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader } from './notification-test-loader.mjs';
const sent = [];
const presented = [];
globalThis.__notificationTest = {
  native: { Platform: { OS: 'android', Version: 35 } },
  audio: { getCallFlowVersion: () => 2 },
};
globalThis.__callerName = { emit: (...args) => sent.push(args), presented };
const load = createNotificationLoader({
  '/clients/websocket-client.ts': 'export const wsClient = globalThis.__callerName;',
  '/state/call-session.ts': 'export function createCallSession(view, requestId) { return { view, requestId, closed: false, nextSync: 0 }; }',
  '/services/call-audio-ownership.ts': 'export async function releaseChatRecorderForCall() {}',
  '/services/call-permissions.ts': 'export async function requestCallPermissions() {}',
  '/services/native-call-media.ts': 'export async function startCallMedia() {}',
  '/services/call-notification-service.ts': 'export function showIncomingCallNotification(call) { globalThis.__callerName.presented.push(call); } export function dismissAllIncomingCallNotifications() {}',
});
const { createCallStore } = await load('state/call-store');
const { createCallLifecycle } = await load('services/call-lifecycle');
const { createCallEventHandlers } = await load('events/call-events');
const { nativeCallService } = await load('services/native-call-service');
const { parseCallPush } = await load('services/call-push');
const callId = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
const incoming = { callId, callerId: 'caller', callerName: 'María Pérez', media: 'video', expiresAt: new Date(Date.now() + 30000).toISOString() };

test('CALL_INIT carries the client username on first send and retries', () => {
  sent.length = 0;
  const store = createCallStore();
  const lifecycle = createCallLifecycle(store);
  lifecycle.start('callee', 'video', '  María Pérez  ');
  lifecycle.tick();
  const requests = sent.filter(([type]) => type === 'CALL_INIT');
  assert.equal(requests.length, 2);
  assert.equal(requests[0][1].callerName, 'María Pérez');
  assert.deepEqual(requests[1], requests[0]);
});
test('CALL_INCOMING provides the displayed participant name without loading conversations', async () => {
  const store = createCallStore();
  const events = createCallEventHandlers(store, {}, {});
  events.handleIncoming(incoming);
  assert.equal(store.getSnapshot().participantName, 'María Pérez');
  await nativeCallService.ensureReady();
  nativeCallService.sync(store.getSnapshot());
  assert.equal(presented.at(-1).name, 'María Pérez');
});
test('a websocket delivery enriches an existing push session without replacing it', () => {
  const store = createCallStore();
  const lifecycle = createCallLifecycle(store);
  lifecycle.inspectFromNotification(callId, { participantId: 'caller', media: 'video' });
  const session = store.getSession();
  const events = createCallEventHandlers(store, lifecycle, {});
  events.handleIncoming(incoming);
  assert.equal(store.getSession(), session);
  assert.equal(store.getSnapshot().participantName, 'María Pérez');
  events.handleIncoming({ ...incoming, callerName: undefined });
  assert.equal(store.getSnapshot().participantName, 'María Pérez');
});
test('push envelopes preserve callerName while legacy or invalid names remain optional', () => {
  const payload = { ...incoming, type: 'call-incoming' };
  assert.equal(parseCallPush({ body: JSON.stringify(payload) }).callerName, 'María Pérez');
  assert.equal(parseCallPush({ ...payload, callerName: 12 }).callerName, undefined);
  assert.equal(parseCallPush({ ...payload, callerName: ' ' }).callerName, undefined);
  assert.equal(parseCallPush({ ...payload, callerName: 'x'.repeat(101) }).callerName.length, 100);
});

test('a lock-screen launch containing only callId keeps the name already presented by Android', async () => {
  let snapshot = null;
  const displays = [];
  globalThis.__callerRuntime = {
    client: {
      mount: () => () => {},
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      inspectFromNotification: (id, metadata) => {
        snapshot = { callId: id, status: 'requesting', incoming: true, ...metadata };
      },
    },
    native: {
      ensureReady: async () => true,
      getIncoming: () => ({ ...incoming, type: 'call-incoming' }),
      displayIncoming: async (...args) => displays.push(args),
      reportError() {},
    },
  };
  const runtimeLoad = createNotificationLoader({
    '/clients/call-client.ts': 'export const createCallClient = () => globalThis.__callerRuntime.client;',
    '/clients/websocket-client.ts': 'export const wsClient = { on: () => () => {}, connect() {} };',
    '/rtc/native-webrtc.ts': 'export const hasNativeCalling = () => true;',
    '/token-storage.ts': 'export const tokenStorage = { getAccessToken: async () => "test-token" };',
    '/services/native-call-service.ts': 'export const nativeCallService = globalThis.__callerRuntime.native;',
    '/services/call-sound-service.ts': 'export const silenceCallSound = () => {}; export const syncCallSound = () => {};',
    '/services/call-notification-service.ts': 'export const dismissIncomingCallNotification = () => {};',
  });
  const { receiveCallPush } = await runtimeLoad('services/call-runtime');
  await receiveCallPush({ ...incoming, type: 'call-incoming', callerName: undefined });
  assert.equal(displays[0][3], 'María Pérez');
  assert.equal(snapshot.participantName, 'María Pérez');
});

test('missed CALL_END updates the incoming caller name before ending the mobile session', () => {
  const store = createCallStore();
  const events = createCallEventHandlers(store, {
    finish: (session, status) => store.publish(session, { status }),
  }, {});
  events.handleIncoming({ ...incoming, callerName: undefined });
  events.handleEnd({ callId, status: 'missed', reason: 'NO_ANSWER', callerName: 'María Pérez' });
  assert.equal(store.getSnapshot().participantName, 'María Pérez');
  assert.equal(store.getSnapshot().status, 'missed');
});
