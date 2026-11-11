import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader } from './notification-test-loader.mjs';

const user = 'ad310f62-2b26-4d87-9944-a4b0f2424592';
const sender = 'ad310f62-2b26-4d87-9944-a4b0f2424593';
const conversationId = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
const messageId = '97070838-624d-4a5b-b677-c9ecbd7f4b51';
let posted = [];
let presented = [];
let dismissed = [];
let handler;
let permission = async () => ({ granted: true });
const native = {
  AppState: { currentState: 'active' },
  Platform: { OS: 'android', Version: 35 },
  NativeModules: {},
};
globalThis.__notificationTest = {
  native,
  notifications: {
    AndroidImportance: { HIGH: 6, MAX: 7 },
    AndroidNotificationVisibility: { PRIVATE: 2, PUBLIC: 1 },
    AndroidAudioUsage: { NOTIFICATION_RINGTONE: 6 },
    AndroidAudioContentType: { SONIFICATION: 4 },
    AndroidNotificationPriority: { HIGH: 'high', MAX: 'max' },
    setNotificationChannelAsync: async () => {},
    setNotificationCategoryAsync: async () => {},
    setNotificationHandler: (value) => {
      handler = value.handleNotification;
    },
    getPermissionsAsync: () => permission(),
    getPresentedNotificationsAsync: async () => presented,
    scheduleNotificationAsync: async (notice) => {
      posted.push(notice);
      return notice.identifier;
    },
    dismissNotificationAsync: async (id) => {
      dismissed.push(id);
    },
  },
};
const load = createNotificationLoader({
  '/token-storage.ts': 'export const tokenStorage = { getAccessToken: async () => "test-token" };',
});
const state = await load('services/notification-state');
const data = await load('services/notification-data');
const service = await load('services/message-notification-service');
const presentation = await load('services/notification-presentation');
presentation.installNotificationPresentation();
const conversation = {
  id: conversationId,
  type: 'PRIVATE',
  members: [{ userId: sender, username: 'Ana' }],
};
const cache = new Map([[conversationId, conversation]]);
const message = (patch) => ({
  id: messageId,
  messageId,
  senderId: sender,
  conversation,
  content: 'Hola',
  type: 'MESSAGE',
  attachments: [],
  ...patch,
});
const makeNotice = () => data.getMessageNotification(message(), user, cache);
const notification = (payload, id = 'remote') => ({
  request: { identifier: id, content: { data: payload } },
});
function reset() {
  state.clearNotificationSession();
  state.setNotificationUser(user);
  posted = [];
  dismissed = [];
  presented = [];
  native.AppState.currentState = 'active';
  permission = async () => ({ granted: true });
}

test('a private message has the sender name, text and exact conversation target', () => {
  reset();
  const notice = makeNotice();
  assert.equal(notice.title, 'Ana');
  assert.equal(notice.body, 'Hola');
  assert.equal(notice.data.conversationId, conversationId);
});
test('own messages and system events do not create incoming message notifications', () => {
  reset();
  assert.equal(data.getMessageNotification(message({ senderId: user }), user, cache), undefined);
  assert.equal(
    data.getMessageNotification(message({ type: 'MEMBER_JOINED' }), user, cache),
    undefined,
  );
});
test('group messages are explicitly outside this flow', () => {
  reset();
  const group = { ...conversation, type: 'GROUP', name: 'Grupo' };
  const groups = new Map([[conversationId, group]]);
  assert.equal(
    data.getMessageNotification(message({ conversation: group }), user, groups),
    undefined,
  );
  assert.equal(
    data.getMessageNotification(message({ conversation: undefined, conversationId }), user, groups),
    undefined,
  );
});
for (const [type, expected] of [
  ['image/jpeg', '📷 Foto'],
  ['video/mp4', '🎥 Video'],
  ['audio/mp4', '🎤 Nota de voz'],
  ['application/pdf', '📎 Archivo adjunto'],
]) {
  test(`a private ${type} attachment has a readable notification preview`, () => {
    const notice = data.getMessageNotification(
      message({ content: '', attachments: [{ contentType: type }] }),
      user,
      cache,
    );
    assert.equal(notice.body, expected);
  });
}
test('message push envelopes are decoded and invalid targets are not used for navigation', () => {
  const payload = { type: 'message', messageId, conversationId };
  assert.deepEqual(
    data.parseMessageNotification({ data: { body: JSON.stringify(payload) } }),
    payload,
  );
  assert.equal(data.parseMessageNotification({ ...payload, conversationId: 'invalid' }), undefined);
  let nested = payload;
  for (let i = 0; i < 10; i++) nested = { data: nested };
  assert.equal(data.parseMessageNotification(nested), undefined);
});
test('a WS message is shown once, and a duplicate remote push is suppressed', async () => {
  reset();
  const notice = makeNotice();
  await service.showMessageNotification(notice);
  await service.showMessageNotification(notice);
  assert.equal(posted.length, 1);
  assert.equal(
    (await handler(notification({ type: 'message', messageId, conversationId }))).shouldShowBanner,
    false,
  );
  assert.equal((await handler(notification(posted[0].content.data))).shouldShowBanner, true);
});
test('a push received first prevents the later WS delivery from generating another alert', async () => {
  reset();
  const remote = notification({ type: 'message', messageId, conversationId });
  assert.equal((await handler(remote)).shouldShowBanner, true);
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 0);
});
test('the conversation being read is silent, while another conversation still notifies', async () => {
  reset();
  state.setVisibleConversation(conversationId);
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 0);
  state.clearNotificationSession();
  state.setNotificationUser(user);
  state.setVisibleConversation(sender);
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 1);
});
test('a backgrounded conversation and a conversation covered by a call still notify', async () => {
  reset();
  state.setVisibleConversation(conversationId);
  native.AppState.currentState = 'background';
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 1);
  reset();
  state.setVisibleConversation(conversationId);
  state.setCallInProgress(true);
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 1);
});
test('a previously shown native push is not duplicated even after JS deduplication state resets', async () => {
  reset();
  presented = [notification({ type: 'message', messageId, conversationId })];
  await service.showMessageNotification(makeNotice());
  assert.equal(posted.length, 0);
});
test('logout during asynchronous permission lookup prevents a late message notification', async () => {
  reset();
  let resolve;
  permission = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = service.showMessageNotification(makeNotice());
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  state.clearNotificationSession();
  resolve({ granted: true });
  await pending;
  assert.equal(posted.length, 0);
});
test('opening a chat dismisses only its message notifications, preserving calls and other chats', async () => {
  reset();
  presented = [
    notification({ type: 'message', messageId, conversationId }, 'matching'),
    notification({ type: 'message', messageId, conversationId: sender }, 'other'),
    notification({ type: 'call-incoming', callId: conversationId }, 'call'),
  ];
  await service.dismissConversationNotifications(conversationId);
  assert.deepEqual(dismissed, ['matching']);
});
test('a cold-start tap resolves a conversation outside the initial page', async () => {
  const requested = [];
  const result = await service.findNotificationConversation(
    conversationId,
    new Map(),
    async (cursor) => {
      requested.push(cursor);
      return cursor
        ? { page: [conversation], nextCursor: null }
        : { page: [], nextCursor: 'second-page' };
    },
    () => true,
  );
  assert.equal(result, conversation);
  assert.deepEqual(requested, [null, 'second-page']);
});
test('an account change during conversation lookup discards the late result', async () => {
  let active = true;
  const result = await service.findNotificationConversation(
    conversationId,
    new Map(),
    async () => {
      active = false;
      return { page: [conversation], nextCursor: null };
    },
    () => active,
  );
  assert.equal(result, undefined);
});
test('an unavailable chat and a repeated pagination cursor stop without an infinite lookup', async () => {
  let pages = 0;
  const result = await service.findNotificationConversation(
    conversationId,
    new Map(),
    async () => {
      pages++;
      return { page: [], nextCursor: 'repeated' };
    },
    () => true,
  );
  assert.equal(result, undefined);
  assert.equal(pages, 2);
});
