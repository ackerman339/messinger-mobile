import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

const user = 'ad310f62-2b26-4d87-9944-a4b0f2424592';
const another = 'ad310f62-2b26-4d87-9944-a4b0f2424593';
const expoToken = 'ExponentPushToken[test-registration-token]';
const nativeToken = { type: 'android', data: 'test-native-token' };
const calls = [];
const logs = [];
let permission;
let requestPermission;
let device;
let expo;
let subscribe;
let callsCategory;
const environment = {
  native: { Platform: { OS: 'android' } },
  constants: {
    executionEnvironment: 'bare',
    expoConfig: { extra: { eas: { projectId: 'test-project' } } },
  },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
  device: { isDevice: true },
  notifications: {
    AndroidImportance: { HIGH: 6, MAX: 7 },
    AndroidNotificationVisibility: { PRIVATE: 2, PUBLIC: 1 },
    AndroidAudioUsage: { NOTIFICATION_RINGTONE: 6 },
    AndroidAudioContentType: { SONIFICATION: 4 },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationChannelAsync: async (id) => {
      calls.push(['channel', id]);
    },
    setNotificationCategoryAsync: (...args) => callsCategory(...args),
    getPermissionsAsync: () => permission(),
    requestPermissionsAsync: () => requestPermission(),
    getDevicePushTokenAsync: () => device(),
    getExpoPushTokenAsync: (options) => expo(options),
  },
  subscriptions: {
    subscribeMobile: (data) => subscribe(data),
    unsubscribeMobile: async (token) => {
      calls.push(['unsubscribe', token]);
    },
  },
};
globalThis.__notificationTest = environment;
const load = createNotificationLoader({
  '/services/push-subscription.ts':
    'export const pushSubscriptionService = globalThis.__notificationTest.subscriptions;',
});
const service = await load('services/push-registration');
const channels = await load('services/notification-channels');
async function reset(t) {
  await service.unregisterPushNotifications();
  calls.length = 0;
  logs.length = 0;
  environment.constants.executionEnvironment = 'bare';
  environment.device.isDevice = true;
  permission = async () => ({ granted: true, status: 'granted', canAskAgain: false });
  requestPermission = async () => {
    calls.push(['permission']);
    return { granted: true, status: 'granted', canAskAgain: true };
  };
  device = async () => {
    calls.push(['native']);
    return nativeToken;
  };
  expo = async (options) => {
    calls.push(['expo', options]);
    return { data: expoToken };
  };
  subscribe = async (data) => {
    calls.push(['subscribe', data]);
  };
  callsCategory = async () => {};
  service.setPushRegistrationUser(user);
  t.mock.method(console, 'info', (...args) => logs.push(args));
  t.mock.method(console, 'warn', (...args) => logs.push(args));
}

test('sign-in registration obtains FCM/Expo tokens before posting the existing authenticated endpoint payload', async (t) => {
  await reset(t);
  assert.equal(
    (await service.registerPushNotifications(user, { requestPermission: true })).status,
    'registered',
  );
  assert.deepEqual(calls.find((call) => call[0] === 'subscribe')[1], {
    token: expoToken,
    platform: 'ANDROID',
  });
  assert.equal(calls.find((call) => call[0] === 'expo')[1].devicePushToken, nativeToken);
  assert.ok(
    calls.findIndex((call) => call[0] === 'native') < calls.findIndex((call) => call[0] === 'expo'),
  );
  assert.ok(
    calls.findIndex((call) => call[0] === 'expo') <
      calls.findIndex((call) => call[0] === 'subscribe'),
  );
});
test('a failure configuring the call category does not prevent registering a message push subscription', async (t) => {
  await reset(t);
  callsCategory = async () => {
    throw Object.assign(new Error('category unavailable'), { code: 'CALL_CATEGORY_FAILED' });
  };
  await assert.rejects(channels.configureNotificationChannels());
  const result = await service.registerPushNotifications(user, { requestPermission: true });
  assert.equal(result.status, 'registered');
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 1);
});
test('the sign-in and UserProvider calls share one registration during navigation', async (t) => {
  await reset(t);
  let resolve;
  device = () =>
    new Promise((done) => {
      resolve = done;
    });
  const signIn = service.registerPushNotifications(user, { requestPermission: true });
  const restored = service.registerPushNotifications(user, { requestPermission: true });
  assert.equal(signIn, restored);
  await flush();
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 0);
  resolve(nativeToken);
  await Promise.all([signIn, restored]);
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 1);
  await service.registerPushNotifications(user);
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 1);
});
test('a previously denied permission that can be requested again is requested on sign-in', async (t) => {
  await reset(t);
  permission = async () => ({ granted: false, status: 'denied', canAskAgain: true });
  assert.equal(
    (await service.registerPushNotifications(user, { requestPermission: true })).status,
    'registered',
  );
  assert.ok(calls.some((call) => call[0] === 'permission'));
});
test('a permanently denied notification permission does not request tokens or send an invalid subscription', async (t) => {
  await reset(t);
  permission = async () => ({ granted: false, status: 'denied', canAskAgain: false });
  assert.equal(
    (await service.registerPushNotifications(user, { requestPermission: true })).status,
    'unavailable',
  );
  assert.equal(
    calls.filter((call) => ['native', 'expo', 'subscribe', 'permission'].includes(call[0])).length,
    0,
  );
  assert.ok(logs.some((line) => line[0] === '[push] notification-permission-required'));
});
test('native-token failure reports its stage and can recover on the next attempt without leaking credentials', async (t) => {
  await reset(t);
  device = async () => {
    throw {
      code: 'E_REGISTRATION_FAILED',
      message: expoToken,
      config: { headers: { authorization: 'Bearer secret-token' } },
    };
  };
  assert.equal((await service.registerPushNotifications(user)).status, 'failed');
  const failure = logs.find((line) => line[0] === '[push] registration-failed')[1];
  assert.equal(failure.stage, 'native-token');
  assert.equal(failure.code, 'E_REGISTRATION_FAILED');
  assert.ok(!JSON.stringify(logs).includes(expoToken));
  assert.ok(!JSON.stringify(logs).includes('secret-token'));
  device = async () => nativeToken;
  assert.equal((await service.registerPushNotifications(user)).status, 'registered');
});
test('an HTTP failure identifies the backend stage and a retry actually repeats the subscription POST', async (t) => {
  await reset(t);
  let failures = 1;
  subscribe = async (data) => {
    calls.push(['subscribe', data]);
    if (failures--)
      throw {
        code: 'ERR_BAD_RESPONSE',
        response: { status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE' } } },
      };
  };
  assert.equal((await service.registerPushNotifications(user)).status, 'failed');
  const failure = logs.find((line) => line[0] === '[push] registration-failed')[1];
  assert.equal(failure.stage, 'backend');
  assert.equal(failure.status, 503);
  assert.equal((await service.registerPushNotifications(user)).status, 'registered');
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 2);
});
test('logout during token acquisition prevents a late backend subscription or a resume from reactivating registration', async (t) => {
  await reset(t);
  let resolve;
  device = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = service.registerPushNotifications(user);
  await flush();
  const logout = service.unregisterPushNotifications();
  resolve(nativeToken);
  assert.equal((await pending).status, 'cancelled');
  await logout;
  assert.equal(
    (await service.registerPushNotifications(user, { force: true })).status,
    'cancelled',
  );
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 0);
});
test('logout waits for an in-flight POST before deleting its subscription', async (t) => {
  await reset(t);
  let resolve;
  subscribe = (data) => {
    calls.push(['subscribe', data]);
    return new Promise((done) => {
      resolve = done;
    });
  };
  const pending = service.registerPushNotifications(user);
  await flush();
  const logout = service.unregisterPushNotifications();
  await flush();
  assert.equal(calls.filter((call) => call[0] === 'unsubscribe').length, 0);
  resolve();
  await pending;
  await logout;
  assert.deepEqual(
    calls.filter((call) => call[0] === 'unsubscribe'),
    [['unsubscribe', expoToken]],
  );
});
test('a queued registration for another user is discarded when logout happens before the old lookup completes', async (t) => {
  await reset(t);
  let resolve;
  device = () =>
    new Promise((done) => {
      resolve = done;
    });
  const old = service.registerPushNotifications(user);
  await flush();
  service.setPushRegistrationUser(another);
  const next = service.registerPushNotifications(another);
  const logout = service.unregisterPushNotifications();
  resolve(nativeToken);
  await Promise.all([old, next, logout]);
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 0);
});
test('an unavailable Expo Go environment explains why no backend request can be issued', async (t) => {
  await reset(t);
  environment.constants.executionEnvironment = 'storeClient';
  assert.equal((await service.registerPushNotifications(user)).status, 'unavailable');
  assert.ok(logs.some((line) => line[0] === '[push] unavailable-environment'));
  assert.equal(calls.filter((call) => call[0] === 'subscribe').length, 0);
});
test('a native-token lookup that never resolves times out instead of blocking all future attempts', async (t) => {
  await reset(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  device = () => new Promise(() => {});
  const pending = service.registerPushNotifications(user);
  await flush();
  t.mock.timers.tick(30_001);
  assert.equal((await pending).status, 'failed');
  assert.equal(
    logs.find((line) => line[0] === '[push] registration-failed')[1].code,
    'PUSH_NATIVE_TOKEN_TIMEOUT',
  );
  device = async () => nativeToken;
  assert.equal((await service.registerPushNotifications(user)).status, 'registered');
});
