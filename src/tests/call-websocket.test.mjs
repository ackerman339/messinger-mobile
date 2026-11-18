import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

let sockets = [];
let refresh = async () => {};
let invalidMessages = [];
class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = Socket.OPEN;
  sent = [];
  constructor() {
    sockets.push(this);
  }
  send(data) {
    assert.equal(
      this.readyState,
      Socket.OPEN,
      'Do not send auth or call events to a closed socket',
    );
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 2;
  }
  closed() {
    this.readyState = 3;
    this.onclose({ currentTarget: this, code: 1000 });
  }
  receive(type, data, requestId) {
    return this.onmessage({ currentTarget: this, data: JSON.stringify({ type, data, requestId }) });
  }
}
globalThis.WebSocket = Socket;
globalThis.__notificationTest = {
  auth: { refresh: () => refresh(), logout: async () => {} },
  tokens: { getAccessToken: async () => 'test-access', clear: async () => {} },
  router: { replace() {} },
};
const load = createNotificationLoader({
  '/services/auth.ts': 'export const authService = globalThis.__notificationTest.auth;',
  '/token-storage.ts': 'export const tokenStorage = globalThis.__notificationTest.tokens;',
});
const ws = await load('clients/websocket-client');
const url = 'wss://example.test';
function reset(t) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'trace', () => {});
  t.mock.method(console, 'error', (...args) => invalidMessages.push(args));
  ws.disconnect();
  sockets = [];
  invalidMessages = [];
  refresh = async () => {};
  globalThis.__notificationTest.tokens.getAccessToken = async () => 'test-access';
  t.after(() => ws.disconnect());
}

test('a delayed close from the background socket cannot detach the new foreground connection', (t) => {
  reset(t);
  ws.connect(url);
  const previous = sockets[0];
  ws.disconnect();
  ws.connect(url);
  const current = sockets[1];
  previous.closed();
  ws.emit('CALL_ACCEPT', { callId: 'current-call' });
  assert.equal(current.sent.at(-1)?.type, 'CALL_ACCEPT');
  ws.connect(url);
  assert.equal(sockets.length, 2);
});

test('late messages from a replaced socket cannot change the current call session', async (t) => {
  reset(t);
  const seen = [];
  const off = ws.on('CALL_END', (event) => seen.push(event));
  t.after(off);
  ws.connect(url);
  const previous = sockets[0];
  ws.disconnect();
  ws.connect(url);
  await previous.receive('CALL_END', { callId: 'current-call', status: 'ended' });
  assert.deepEqual(seen, []);
  await sockets[1].receive('CALL_END', { callId: 'current-call', status: 'ended' });
  assert.equal(seen.length, 1);
});

test('session refresh authenticates the replacement connection without sending to the closed one', async (t) => {
  reset(t);
  let resolve;
  refresh = () =>
    new Promise((done) => {
      resolve = done;
    });
  ws.connect(url);
  const previous = sockets[0];
  const handling = previous.receive('ERROR', {
    error: { message: 'WS_AUTH:INVALID_ACCESS_TOKEN' },
  });
  await flush();
  assert.equal(sockets.length, 1);
  resolve();
  await handling;
  await flush();
  assert.equal(sockets.length, 2);
  assert.equal(previous.sent.length, 0);
  assert.deepEqual(invalidMessages, []);
  await sockets[1].receive('REQUEST_AUTH_TOKEN', {});
  assert.equal(sockets[1].sent.at(-1)?.type, 'AUTH_TOKEN_SENT');
});

test('closing the active connection still schedules its normal reconnect', async (t) => {
  reset(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  ws.connect(url);
  sockets[0].closed();
  t.mock.timers.tick(301);
  assert.equal(sockets.length, 2);
});

test('a token lookup finishing after reconnect cannot authenticate the obsolete socket', async (t) => {
  reset(t);
  let resolve;
  globalThis.__notificationTest.tokens.getAccessToken = () =>
    new Promise((done) => {
      resolve = done;
    });
  ws.connect(url);
  const previous = sockets[0];
  const handling = previous.receive('REQUEST_AUTH_TOKEN', {});
  ws.disconnect();
  ws.connect(url);
  resolve('test-access');
  await handling;
  assert.equal(previous.sent.length, 0);
  assert.deepEqual(invalidMessages, []);
});

test('group commands wait for matching persistence confirmations', async (t) => {
  reset(t);
  ws.connect(url);
  let resolved = false;
  const pending = ws.request('GROUP_INVITE_MEMBER', { conversationId: 'group', targetUserId: 'member' }).then(() => { resolved = true; });
  const request = sockets[0].sent.at(-1);
  assert.ok(request.requestId);
  await sockets[0].receive('GROUP_ACTION_CONFIRMED', { event: 'GROUP_INVITE_MEMBER' }, 'unrelated');
  assert.equal(resolved, false);
  await sockets[0].receive('GROUP_ACTION_CONFIRMED', { event: 'GROUP_INVITE_MEMBER' }, request.requestId);
  await pending;
  assert.equal(resolved, true);
});
test('group errors reject their correlated command', async (t) => {
  reset(t);
  ws.connect(url);
  const pending = ws.request('GROUP_INVITATION_ACCEPT', { conversationId: 'group' });
  const rejection = assert.rejects(pending, /EXPIRED/);
  await sockets[0].receive('ERROR', { error: { code: 'GROUP_INVITATION:EXPIRED' } }, sockets[0].sent.at(-1).requestId);
  await rejection;
});
test('group commands reject immediately while offline and after disconnect', async (t) => {
  reset(t);
  await assert.rejects(ws.request('GROUP_INVITATION_REJECT', { conversationId: 'group' }), /conexión/);
  ws.connect(url);
  const pending = ws.request('GROUP_INVITATION_REJECT', { conversationId: 'group' });
  const rejection = assert.rejects(pending, /conexión/);
  ws.disconnect();
  await rejection;
});
test('invitations received before the chat mounts replay once to its subscriber', async (t) => {
  reset(t);
  ws.connect(url);
  const data = { conversationId: 'group', groupName: 'Equipo', invitedBy: 'owner' };
  await sockets[0].receive('GROUP_INVITATION', data);
  const received = [];
  const off = ws.on('GROUP_INVITATION', (invitation) => received.push(invitation));
  t.after(off);
  await flush();
  assert.deepEqual(received, [data]);
});
test('rejected invitations buffered before mount do not reappear', async (t) => {
  reset(t);
  ws.connect(url);
  await sockets[0].receive('GROUP_INVITATION', { conversationId: 'group', groupName: 'Equipo' });
  await sockets[0].receive('GROUP_INVITATION_REJECTED', { conversationId: 'group' });
  const received = [];
  const off = ws.on('GROUP_INVITATION', (invitation) => received.push(invitation));
  t.after(off);
  await flush();
  assert.deepEqual(received, []);
});
