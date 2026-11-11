import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

const operations = [];
let releaseMedia = async () => {};
const audio = {
  startCallTone: (...args) => operations.push(['start', ...args]),
  stopCallTone: (key) => operations.push(['stop', key]),
  stopCallToneBeforeMedia: async () => {
    operations.push(['media']);
    await releaseMedia();
  },
};
const environment = {
  native: { Platform: { OS: 'android', Version: 35 } },
  audio,
  expoAudio: {
    createAudioPlayer() {
      throw new Error('Android must use the native ringtone player');
    },
    setAudioModeAsync() {
      throw new Error('Android ringtone must not change Expo audio mode');
    },
  },
};
globalThis.__notificationTest = environment;
const load = createNotificationLoader();
const service = await load('services/call-sound-service');
const { getNativeCallTone } = await load('services/native-call-tone');
const call = (patch = {}) => ({
  callId: 'first-call',
  participantId: 'other',
  incoming: true,
  status: 'ringing',
  media: 'audio',
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  ...patch,
});
async function reset(t) {
  service.syncCallSound(null);
  await flush();
  operations.length = 0;
  t.after(async () => {
    releaseMedia = async () => {};
    environment.audio = audio;
    service.syncCallSound(null);
    await flush();
  });
}

test('cold-start incoming audio reaches Android immediately without Expo player or mode initialization', async (t) => {
  await reset(t);
  const incoming = call();
  service.syncCallSound(incoming);
  assert.deepEqual(operations[0].slice(2), [
    incoming.callId,
    'incoming',
    Date.parse(incoming.expiresAt),
  ]);
  assert.equal(operations.length, 1);
  // An identical server sync keeps the same native key, preserving playback position.
  service.syncCallSound(incoming);
  assert.equal(operations[0][1], operations[1][1]);
  service.syncCallSound(call({ status: 'accepted' }));
  assert.deepEqual(operations.at(-1), ['stop', operations[0][1]]);
});

test('outgoing voice/video ringback keeps its native identity when CALL_CREATED supplies a UUID', async (t) => {
  await reset(t);
  for (const media of ['audio', 'video']) {
    service.syncCallSound(
      call({ media, incoming: false, status: 'requesting', callId: undefined }),
    );
    const first = operations.at(-1);
    assert.equal(first[2], '');
    assert.equal(first[3], 'outgoing');
    service.syncCallSound(call({ media, incoming: false }));
    assert.equal(operations.at(-1)[1], first[1]);
    assert.equal(operations.at(-1)[2], 'first-call');
    service.syncCallSound(null);
  }
});

test('answering waits for Android to release the ringtone before microphone capture can continue', async (t) => {
  await reset(t);
  service.syncCallSound(call());
  let done;
  releaseMedia = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  let mediaReady = false;
  const waiting = service.stopCallSoundBeforeMedia().then(() => {
    mediaReady = true;
  });
  await flush();
  assert.equal(mediaReady, false);
  assert.equal(operations.at(-2)[0], 'stop');
  assert.equal(operations.at(-1)[0], 'media');
  done();
  await waiting;
  assert.equal(mediaReady, true);
});

test('silencing prevents stale snapshots from requesting native playback again; later calls get new keys', async (t) => {
  await reset(t);
  service.syncCallSound(call());
  const firstKey = operations[0][1];
  service.silenceCallSound('first-call');
  const count = operations.length;
  service.syncCallSound(call());
  assert.equal(operations.length, count);
  service.syncCallSound(null);
  service.syncCallSound(call({ callId: 'second-call' }));
  assert.equal(operations.at(-1)[0], 'start');
  assert.notEqual(operations.at(-1)[1], firstKey);
});

test('expired pushes never start native audio', async (t) => {
  await reset(t);
  service.syncCallSound(call({ expiresAt: new Date(0).toISOString() }));
  assert.equal(operations.length, 0);
});

test('native deadline is supplied once even if the backend omitted expiresAt', async (t) => {
  await reset(t);
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const incoming = call({ expiresAt: undefined });
  service.syncCallSound(incoming);
  const deadline = operations[0][4];
  assert.equal(deadline, Date.now() + 60_000);
  t.mock.timers.tick(5_000);
  service.syncCallSound(incoming);
  assert.equal(operations.at(-1)[4], deadline);
});

test('older binaries without tone methods are detected before invoking new native APIs', async (t) => {
  await reset(t);
  environment.audio = { getBuiltinOutputs() {} };
  assert.equal(getNativeCallTone(), undefined);
});
test('incoming calls delegate the ringtone to the Android notification without a second player', async (t) => {
  await reset(t);
  environment.audio = { ...audio, presentIncomingCall() {}, dismissIncomingCall() {} };
  service.syncCallSound(call());
  await flush();
  assert.equal(operations.length, 0);
});
