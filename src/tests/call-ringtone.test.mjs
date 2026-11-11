import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

let players = [];
let modes = [];
let mode = async () => {};
const environment = {
  native: { AppState: { currentState: 'active' }, Platform: { OS: 'android', Version: 35 } },
  expoAudio: {
    createAudioPlayer: (source, options) => {
      const events = new Set();
      const player = {
        source,
        options,
        loop: false,
        volume: 1,
        plays: 0,
        pauses: 0,
        releases: 0,
        seeks: [],
        play() {
          this.plays++;
        },
        pause() {
          this.pauses++;
        },
        remove() {
          this.releases++;
        },
        seekTo(seconds) {
          this.seeks.push(seconds);
          return Promise.resolve();
        },
        addListener: (name, callback) => {
          assert.equal(name, 'playbackStatusUpdate');
          events.add(callback);
          return { remove: () => events.delete(callback) };
        },
        emit(status) {
          events.forEach((callback) => callback(status));
        },
        events,
      };
      players.push(player);
      return player;
    },
    setAudioModeAsync: async (value) => {
      modes.push(value);
      await mode(value);
    },
  },
};
globalThis.__notificationTest = environment;
const load = createNotificationLoader();
const { createCallRingtone, getCallSound } = await load('services/call-ringtone');
const service = await load('services/call-sound-service');
const id = '97070838-624d-4a5b-b677-c9ecbd7f4b50';
const call = (patch) => ({
  callId: id,
  participantId: 'other',
  incoming: true,
  status: 'ringing',
  media: 'audio',
  ...patch,
});
async function reset(t) {
  mode = async () => {};
  service.syncCallSound(null);
  await flush();
  players = [];
  modes = [];
  environment.native.AppState.currentState = 'active';
  t.after(async () => {
    service.syncCallSound(null);
    await flush();
  });
}
for (const sound of ['incoming', 'outgoing']) {
  test(`${sound} uses the web WAV and volume with native repetition enabled`, async (t) => {
    await reset(t);
    const stop = createCallRingtone(sound);
    const player = players[0];
    assert.ok(player.source.endsWith(`${sound}-call.wav`));
    assert.equal(player.loop, true);
    assert.equal(player.volume, sound === 'incoming' ? 0.6 : 0.3);
    assert.equal(player.options.updateInterval, 250);
    player.loop = false;
    player.emit({ isLoaded: true, loop: false, didJustFinish: false });
    assert.equal(player.loop, true);
    stop();
    stop();
    assert.equal(player.releases, 1);
  });
  test(`${sound} replays from zero if the native player reports completion despite loop mode`, async (t) => {
    await reset(t);
    const stop = createCallRingtone(sound);
    const player = players[0];
    for (let i = 0; i < 3; i++) {
      player.emit({ isLoaded: true, loop: false, didJustFinish: true });
      player.emit({ isLoaded: true, loop: false, didJustFinish: true });
      await flush();
      player.emit({ isLoaded: true, loop: true, didJustFinish: false });
    }
    assert.equal(player.plays, 4);
    assert.deepEqual(player.seeks, [0, 0, 0]);
    stop();
  });
}
test('hanging up during a fallback seek cannot restart or use a released player', async (t) => {
  await reset(t);
  const stop = createCallRingtone('incoming');
  const player = players[0];
  let resolve;
  player.seekTo = () =>
    new Promise((done) => {
      resolve = done;
    });
  player.emit({ isLoaded: true, loop: true, didJustFinish: true });
  stop();
  resolve();
  await flush();
  assert.equal(player.plays, 1);
  assert.equal(player.releases, 1);
  assert.equal(player.events.size, 0);
});
test('voice and video choose the same ringing states as the web client', () => {
  for (const media of ['audio', 'video']) {
    assert.equal(getCallSound(call({ media })), 'incoming');
    assert.equal(getCallSound(call({ media, incoming: false, status: 'requesting' })), 'outgoing');
    assert.equal(getCallSound(call({ media, incoming: false })), 'outgoing');
    for (const status of ['accepted', 'connected', 'ended', 'rejected', 'missed', 'failed'])
      assert.equal(getCallSound(call({ status, media })), undefined);
    assert.equal(getCallSound(call({ answering: true, media })), undefined);
    assert.equal(getCallSound(call({ incoming: false, ending: true, media })), undefined);
  }
});
test('status refreshes and entering the background preserve one looping player', async (t) => {
  await reset(t);
  service.syncCallSound(call());
  await flush();
  environment.native.AppState.currentState = 'background';
  service.syncCallSound(call({ notice: 'Still ringing' }));
  await flush();
  assert.equal(players.length, 1);
  assert.equal(players[0].pauses, 0);
  assert.equal(modes[0].shouldPlayInBackground, true);
  service.syncCallSound(call({ status: 'accepted' }));
  await flush();
  assert.equal(players[0].pauses, 1);
  assert.equal(players[0].releases, 1);
  // Do not change Expo routing while WebRTC is active.
  assert.equal(modes.length, 1);
  service.syncCallSound(call({ status: 'ended' }));
  await flush();
  assert.equal(modes.at(-1).shouldPlayInBackground, false);
});
test('CALL_CREATED does not restart the outgoing ringback when its callId arrives', async (t) => {
  await reset(t);
  service.syncCallSound(call({ callId: undefined, incoming: false, status: 'requesting' }));
  await flush();
  service.syncCallSound(call({ incoming: false }));
  await flush();
  assert.equal(players.length, 1);
});
test('accepting while audio mode initializes cannot start a late ringtone, and media waits for setup', async (t) => {
  await reset(t);
  let resolve;
  mode = () =>
    new Promise((done) => {
      resolve = done;
    });
  service.syncCallSound(call());
  await flush();
  service.syncCallSound(call({ status: 'accepted' }));
  let ready = false;
  const settling = service.stopCallSoundBeforeMedia().then(() => {
    ready = true;
  });
  await flush();
  assert.equal(ready, false);
  resolve();
  await settling;
  await flush();
  assert.equal(players.length, 0);
  mode = async () => {};
});
test('rejecting or system-silencing a pending call stops immediately and state sync cannot restart it', async (t) => {
  await reset(t);
  service.syncCallSound(call());
  await flush();
  service.silenceCallSound(id);
  service.syncCallSound(call());
  await flush();
  assert.equal(players.length, 1);
  assert.equal(players[0].releases, 1);
});
test('a stale notification action does not silence another incoming call', async (t) => {
  await reset(t);
  service.syncCallSound(call());
  await flush();
  service.silenceCallSound('another-call');
  assert.equal(players[0].pauses, 0);
});
test('ending a call permits another outgoing call to the same participant to ring again', async (t) => {
  await reset(t);
  service.syncCallSound(call({ incoming: false }));
  await flush();
  service.syncCallSound(call({ status: 'ended', incoming: false }));
  service.silenceCallSound(id);
  await flush();
  service.syncCallSound(call({ callId: 'new-call', incoming: false }));
  await flush();
  assert.equal(players.length, 2);
});
test('expired calls do not ring even if a delayed server snapshot still says ringing', async (t) => {
  await reset(t);
  service.syncCallSound(call({ expiresAt: new Date(0).toISOString() }));
  await flush();
  assert.equal(players.length, 0);
});

test('a live ringtone stops at its deadline and cannot be revived by a stale ringing snapshot', async (t) => {
  await reset(t);
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const ringing = call({ expiresAt: new Date(Date.now() + 30_000).toISOString() });
  service.syncCallSound(ringing);
  await flush();
  assert.equal(players.length, 1);
  t.mock.timers.tick(30_001);
  await flush();
  assert.equal(players[0].releases, 1);
  service.syncCallSound(ringing);
  await flush();
  assert.equal(players.length, 1);
});
