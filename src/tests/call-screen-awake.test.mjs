import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

let dispose;
let listener;
let operations = [];
let activate = async () => {};
const environment = {
  react: {
    useEffect: (effect) => {
      dispose = effect();
    },
  },
  native: {
    AppState: {
      currentState: 'active',
      addEventListener: (_, callback) => {
        listener = callback;
        return { remove() {} };
      },
    },
  },
  keepAwake: {
    activateKeepAwakeAsync: async (tag) => {
      operations.push(['on', tag]);
      await activate();
    },
    deactivateKeepAwake: async (tag) => {
      operations.push(['off', tag]);
    },
  },
};
globalThis.__notificationTest = environment;
const { useCallScreenAwake: renderCallScreen } = await createNotificationLoader()(
  'hooks/use-call-screen-awake',
);
function setup(t) {
  operations = [];
  activate = async () => {};
  environment.native.AppState.currentState = 'active';
  t.after(async () => {
    dispose?.();
    dispose = undefined;
    await flush();
  });
}
test('video keeps its screen awake, releases on background, and restores on foreground', async (t) => {
  setup(t);
  renderCallScreen({ media: 'video', status: 'connected' });
  await flush();
  assert.equal(operations[0][0], 'on');
  environment.native.AppState.currentState = 'background';
  listener();
  await flush();
  assert.equal(operations.at(-1)[0], 'off');
  environment.native.AppState.currentState = 'active';
  listener();
  await flush();
  assert.equal(operations.at(-1)[0], 'on');
});
test('voice calls and terminal video panels allow the screen to sleep', async (t) => {
  setup(t);
  for (const media of ['audio', 'video']) {
    renderCallScreen({ media, status: media === 'video' ? 'ended' : 'connected' });
    await flush();
  }
  assert.equal(operations.length, 0);
});
test('ending video while activation is pending still releases that wake tag after it resolves', async (t) => {
  setup(t);
  let resolve;
  activate = () =>
    new Promise((done) => {
      resolve = done;
    });
  renderCallScreen({ media: 'video', status: 'accepted' });
  await flush();
  const tag = operations[0][1];
  dispose();
  dispose = undefined;
  resolve();
  await flush();
  assert.deepEqual(operations.at(-1), ['off', tag]);
});
