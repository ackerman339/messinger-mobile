import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

const id = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
const user = 'ad310f62-2b26-4d87-9944-a4b0f2424592';
const other = 'ad310f62-2b26-4d87-9944-a4b0f2424593';
let posted = [];
let dismissed = [];
let presented = [];
let categories = [];
let handler;
let permission = async () => ({ granted: true });
let post = async (notice) => {
  posted.push(notice);
  return notice.identifier;
};
const nativeClosed = new Set();
const nativeIds = new Set();
const nativeActions = [];
const events = new Map();
const calls = [];
const native = {
  AppState: { currentState: 'active' },
  Platform: { OS: 'android', Version: 35 },
  NativeModules: { WebRTCModule: {}, RNCallKeep: {} },
  AppRegistry: { registerHeadlessTask() {} },
};
globalThis.__notificationTest = {
  native,
  audio: {
    getCallFlowVersion: () => 2,
    setProximityEnabled() {},
    getAudioRoutes: async () => [],
    presentIncomingCall: async (callId, callerId, media, name, expires) => {
      if (nativeClosed.has(callId)) return;
      nativeIds.add(callId);
      await post({
        identifier: `messinger-call:${callId}`,
        content: {
          title: name,
          sticky: true,
          categoryIdentifier: 'messingerIncomingCall',
          data: {
            type: 'call-incoming',
            callId,
            callerId,
            media,
            expiresAt: new Date(expires).toISOString(),
            localNotification: 'call',
          },
        },
      });
      if (nativeClosed.has(callId)) dismissed.push(`messinger-call:${callId}`);
    },
    dismissIncomingCall: (callId) => {
      nativeClosed.add(callId);
      dismissed.push(`messinger-call:${callId}`);
    },
    acceptIncomingCall: (callId) => {
      nativeActions.push(['answer', callId]);
      dismissed.push(`messinger-call:${callId}`);
    },
    finishCallPresentation: (callId) => {
      nativeClosed.add(callId);
      nativeActions.push(['end', callId]);
    },
    clearCalls: () => {
      for (const id of nativeIds) nativeClosed.add(id);
      nativeIds.clear();
    },
  },
  notifications: {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    AndroidImportance: { HIGH: 6, MAX: 7 },
    AndroidNotificationVisibility: { PRIVATE: 2, PUBLIC: 1 },
    AndroidAudioUsage: { NOTIFICATION_RINGTONE: 6 },
    AndroidAudioContentType: { SONIFICATION: 4 },
    AndroidNotificationPriority: { HIGH: 'high', MAX: 'max' },
    setNotificationHandler: (value) => {
      handler = value.handleNotification;
    },
    setNotificationChannelAsync: async () => {},
    setNotificationCategoryAsync: async (name, actions) => {
      categories.push({ name, actions });
    },
    getPermissionsAsync: () => permission(),
    scheduleNotificationAsync: (notice) => post(notice),
    dismissNotificationAsync: async (identifier) => {
      dismissed.push(identifier);
    },
    getPresentedNotificationsAsync: async () => presented,
    clearLastNotificationResponseAsync: async () => {},
    getLastNotificationResponseAsync: async () => null,
    addNotificationReceivedListener: (callback) => {
      events.set('received', callback);
      return { remove() {} };
    },
    addNotificationResponseReceivedListener: (callback) => {
      events.set('response', callback);
      return { remove() {} };
    },
  },
  tasks: {
    defineTask: (_, callback) => {
      events.set('task', callback);
    },
    isTaskRegisteredAsync: async () => true,
  },
  runtime: {
    bindNativeCallEvents() {},
    receiveCallPush: async (data) => {
      calls.push(['push', data]);
    },
    respondToCall: async (...args) => {
      calls.push(['respond', ...args]);
    },
    callClient: { getSnapshot: () => null },
  },
};
const load = createNotificationLoader({
  '/token-storage.ts': 'export const tokenStorage = { getAccessToken: async () => "test-token" };',
  '/services/call-runtime.ts':
    'export const { bindNativeCallEvents, receiveCallPush, respondToCall, callClient } = globalThis.__notificationTest.runtime;',
});
const state = await load('services/notification-state');
const callUi = await load('services/call-notification-service');
const channel = await load('services/notification-channels');
const tasks = await load('tasks/call-notifications');
const makeCall = (patch = {}) => ({
  callId: id,
  callerId: other,
  name: 'Ana',
  media: 'video',
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  ...patch,
});
const notification = (data) => ({ request: { identifier: 'remote', content: { data } } });
async function reset(t) {
  callUi.dismissAllIncomingCallNotifications();
  await flush();
  state.clearNotificationSession();
  state.setNotificationUser(user);
  nativeClosed.clear();
  nativeIds.clear();
  nativeActions.length = 0;
  posted = [];
  dismissed = [];
  presented = [];
  calls.length = 0;
  permission = async () => ({ granted: true });
  post = async (notice) => {
    posted.push(notice);
    return notice.identifier;
  };
  native.AppState.currentState = 'active';
  t.after(async () => {
    callUi.dismissAllIncomingCallNotifications();
    await flush();
  });
}

test('the incoming category registers real accept and background-reject buttons', async () => {
  await channel.configureNotificationChannels();
  const incoming = categories.find((item) => item.name === channel.INCOMING_CALL_CATEGORY);
  assert.ok(incoming);
  assert.ok(!/[:-]/.test(incoming.name));
  assert.equal(
    incoming.actions.find((action) => action.identifier === 'accept').options.opensAppToForeground,
    true,
  );
  assert.equal(
    incoming.actions.find((action) => action.identifier === 'reject').options.opensAppToForeground,
    false,
  );
});
test('repeated incoming events produce one actionable notification with one stable call identifier', async (t) => {
  await reset(t);
  const call = makeCall();
  callUi.showIncomingCallNotification(call);
  callUi.showIncomingCallNotification(call);
  await flush();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].identifier, `messinger-call:${id}`);
  assert.equal(posted[0].content.categoryIdentifier, channel.INCOMING_CALL_CATEGORY);
  assert.equal(posted[0].content.data.localNotification, 'call');
  assert.equal(posted[0].content.sticky, true);
});
test('hanging up while permissions are being read prevents a late incoming banner', async (t) => {
  await reset(t);
  let resolve;
  permission = () =>
    new Promise((done) => {
      resolve = done;
    });
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  callUi.dismissIncomingCallNotification(id);
  resolve({ granted: true });
  await flush();
  assert.equal(posted.length, 0);
  assert.ok(dismissed.includes(`messinger-call:${id}`));
});
test('hanging up during presentation removes the notification after the native post finishes', async (t) => {
  await reset(t);
  let resolve;
  post = (notice) => {
    posted.push(notice);
    return new Promise((done) => {
      resolve = done;
    });
  };
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  callUi.dismissIncomingCallNotification(id);
  resolve(`messinger-call:${id}`);
  await flush();
  assert.equal(posted.length, 1);
  assert.equal(dismissed.at(-1), `messinger-call:${id}`);
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  assert.equal(posted.length, 1);
});
test('expired incoming calls and denied notification permission do not post a call alert', async (t) => {
  await reset(t);
  callUi.showIncomingCallNotification(makeCall({ expiresAt: new Date(0).toISOString() }));
  await flush();
  assert.equal(posted.length, 0);
  state.setNotificationUser(other);
  permission = async () => ({ granted: false });
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  assert.equal(posted.length, 0);
});
test('granting notification permission while a call rings allows its next sync to show the alert', async (t) => {
  await reset(t);
  const call = makeCall();
  permission = async () => ({ granted: false });
  callUi.showIncomingCallNotification(call);
  await flush();
  assert.equal(posted.length, 0);
  permission = async () => ({ granted: true });
  callUi.showIncomingCallNotification(call);
  await flush();
  assert.equal(posted.length, 1);
});
test('a failed older presentation cannot discard an updated caller alert waiting in the queue', async (t) => {
  await reset(t);
  let reject;
  post = () =>
    new Promise((resolve, fail) => {
      reject = fail;
    });
  const call = makeCall();
  callUi.showIncomingCallNotification(call);
  await flush();
  callUi.showIncomingCallNotification({ ...call, name: 'Contacto actualizado' });
  post = async (notice) => {
    posted.push(notice);
    return notice.identifier;
  };
  reject(new Error('Native notification post failed'));
  await flush();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].content.title, 'Contacto actualizado');
});
test('session restoration can retry the same call metadata after invalidating headless presentation', async (t) => {
  await reset(t);
  let resolve;
  permission = () =>
    new Promise((done) => {
      resolve = done;
    });
  const call = makeCall();
  callUi.showIncomingCallNotification(call);
  await flush();
  state.setNotificationUser(other);
  permission = async () => ({ granted: true });
  callUi.showIncomingCallNotification(call);
  resolve({ granted: true });
  await flush();
  assert.equal(posted.length, 1);
});
test('remote call pushes are replaced, while locally generated call alerts do not recursively redispatch', async (t) => {
  await reset(t);
  const stop = tasks.subscribeCallNotifications();
  const push = { type: 'call-incoming', ...makeCall() };
  events.get('received')(notification({ ...push, localNotification: 'call' }));
  await flush();
  assert.equal(calls.length, 0);
  events.get('received')(notification(push));
  await flush();
  assert.equal(calls.filter((call) => call[0] === 'push').length, 1);
  assert.equal((await handler(notification(push))).shouldShowBanner, false);
  assert.equal(
    (await handler(notification({ ...push, localNotification: 'call' }))).shouldShowList,
    true,
  );
  stop();
});
for (const [action, expected] of [
  ['accept', 'accept'],
  ['reject', 'reject'],
  ['default', 'accept'],
]) {
  test(`notification ${action} maps only to its explicit call action`, async (t) => {
    await reset(t);
    const call = makeCall();
    await tasks.handleCallNotificationResponse({
      notification: notification({ type: 'call-incoming', ...call }),
      actionIdentifier: action,
    });
    assert.deepEqual(calls, [['respond', id, expected, call.expiresAt]]);
  });
}
test('unknown notification actions and expired taps cannot accidentally accept a call', async (t) => {
  await reset(t);
  await tasks.handleCallNotificationResponse({
    notification: notification({ type: 'call-incoming', ...makeCall() }),
    actionIdentifier: 'unrelated',
  });
  await tasks.handleCallNotificationResponse({
    notification: notification({
      type: 'call-incoming',
      ...makeCall({ expiresAt: new Date(0).toISOString() }),
    }),
    actionIdentifier: 'default',
  });
  assert.equal(calls.length, 0);
  assert.ok(dismissed.includes(`messinger-call:${id}`));
});
test('logout invalidates pending notification work before it can post for another session', async (t) => {
  await reset(t);
  let resolve;
  permission = () =>
    new Promise((done) => {
      resolve = done;
    });
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  state.clearNotificationSession();
  resolve({ granted: true });
  await flush();
  assert.equal(posted.length, 0);
});
test('the native call service initializes in the background without a Telecom account', async (t) => {
  await reset(t);
  native.AppState.currentState = 'background';
  const setup = [];
  globalThis.__notificationTest.callKeep = {
    setup: async (options) => {
      setup.push(options);
    },
    isConnectionServiceAvailable: async () => true,
    checkPhoneAccountEnabled: () => {
      throw new Error('Managed phone account must not be queried');
    },
    setAvailable() {},
    canMakeMultipleCalls() {},
    reportEndCallWithUUID() {},
  };
  const { nativeCallService } = await load('services/native-call-service');
  assert.equal(await nativeCallService.ensureReady(), true);
  assert.equal(setup.length, 0);
  nativeCallService.clear();
});

test('the service presents the incoming alert directly and accepts it exactly once', async (t) => {
  await reset(t);
  globalThis.__notificationTest.callKeep = {
    setup: async () => {},
    isConnectionServiceAvailable: async () => true,
    setAvailable() {},
    canMakeMultipleCalls() {},
    displayIncomingCall: (uuid) => nativeActions.push(['incoming', uuid]),
    answerIncomingCall: (uuid) => nativeActions.push(['answer', uuid]),
    reportEndCallWithUUID: (uuid) => nativeActions.push(['end', uuid]),
    updateDisplay() {},
  };
  const { nativeCallService: service } = await load('services/native-call-service');
  await service.ensureReady();
  const call = {
    callId: id,
    participantId: other,
    incoming: true,
    status: 'ringing',
    media: 'audio',
    selected: false,
    muted: false,
    cameraOff: false,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
  service.sync(call);
  await flush();
  assert.equal(posted.length, 1);
  service.sync(call);
  await flush();
  assert.equal(posted.length, 1);
  service.sync({ ...call, status: 'accepted', selected: true });
  service.sync({ ...call, status: 'accepted', selected: true });
  await flush();
  assert.equal(nativeActions.filter((action) => action[0] === 'answer').length, 1);
  assert.ok(dismissed.includes(`messinger-call:${id}`));
  service.sync({ ...call, status: 'ended' });
  service.clear();
});
test('a generic call push is removed only after its actionable replacement exists, preserving missed-call alerts', async (t) => {
  await reset(t);
  presented = [
    notification({ type: 'call-incoming', ...makeCall() }),
    {
      request: { identifier: 'missed', content: { data: { type: 'call-missed', ...makeCall() } } },
    },
  ];
  callUi.showIncomingCallNotification(makeCall());
  await flush();
  assert.ok(dismissed.includes('remote'));
  assert.ok(!dismissed.includes('missed'));
});
test('a background push does not remove its fallback banner before Telecom requests a custom UI', async (t) => {
  await reset(t);
  native.AppState.currentState = 'background';
  const push = { type: 'call-incoming', ...makeCall() };
  presented = [notification(push)];
  await events.get('task')({ data: { data: { body: JSON.stringify(push) } } });
  assert.equal(calls.filter((call) => call[0] === 'push').length, 1);
  assert.equal(dismissed.length, 0);
});
