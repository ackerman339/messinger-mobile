import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

const alerts = [];
const actions = [];
let granted = false;
let canAskAgain = false;
let fullscreen = false;
let manufacturer = false;
let requested = 0;
globalThis.__notificationTest = {
  native: {
    Platform: { OS: 'android', Version: 35 },
    AppState: { currentState: 'active' },
    Linking: { openSettings: async () => actions.push('app') },
    Alert: { alert: (...args) => alerts.push(args) },
  },
  audio: {
    canUseFullScreenCalls: () => fullscreen,
    openFullScreenCallSettings: () => actions.push('fullscreen'),
    hasManufacturerCallSettings: () => manufacturer,
    openManufacturerCallSettings: () => actions.push('manufacturer'),
  },
  notifications: {
    getPermissionsAsync: async () => ({ granted, canAskAgain }),
    requestPermissionsAsync: async () => { requested++; granted = true; return { granted, canAskAgain }; },
  },
  secureStore: { getItemAsync: async () => null, setItemAsync: async () => {} },
};
const load = createNotificationLoader({
  '/services/notification-channels.ts': 'export async function configureNotificationChannels() {}',
});
const { explainFullScreenCallPermission: request } = await load('services/call-fullscreen-permission');
function reset() {
  alerts.length = 0; actions.length = 0; requested = 0;
  granted = false; canAskAgain = false; fullscreen = false; manufacturer = false;
  globalThis.__notificationTest.native.AppState.currentState = 'active';
}
async function chooseSettings(task) {
  await flush();
  assert.equal(alerts.length, 1);
  alerts[0][2][1].onPress();
  await task;
}

test('a permanently denied notification permission opens app settings without requesting again', async () => {
  reset();
  await chooseSettings(request(true));
  assert.equal(requested, 0);
  assert.deepEqual(actions, ['app']);
});
test('manual retry requests the OS permission then explains fullscreen, with no overlapping dialogs', async () => {
  reset(); canAskAgain = true;
  const task = request(true);
  await flush();
  await request(true);
  assert.equal(alerts.length, 1);
  assert.equal(requested, 1);
  await chooseSettings(task);
  assert.deepEqual(actions, ['fullscreen']);
});
test('manufacturer guidance opens vendor settings and remains manually accessible', async () => {
  reset(); granted = true; fullscreen = true; manufacturer = true;
  await chooseSettings(request(true));
  assert.deepEqual(actions, ['manufacturer']);
  assert.match(alerts[0][1], /pantalla de bloqueo/);
});
test('headless/background execution never requests permission or opens dialogs', async () => {
  reset(); canAskAgain = true;
  globalThis.__notificationTest.native.AppState.currentState = 'background';
  await request(true);
  assert.equal(requested, 0);
  assert.equal(alerts.length, 0);
});
