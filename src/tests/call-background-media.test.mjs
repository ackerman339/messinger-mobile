import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

let events = [];
let promote = async () => {};
let capture = async () => stream;
const tracks = ['audio', 'video'].map((kind) => ({
  kind,
  id: kind,
  remote: false,
  readyState: 'live',
  enabled: true,
  stop() {},
  release() {},
}));
const stream = { getTracks: () => tracks, getVideoTracks: () => [tracks[1]], release() {} };
class Peer {
  addEventListener() {}
  addTrack() {}
  close() {}
}
const environment = {
  native: { Platform: { OS: 'android', Version: 36 } },
  audio: {
    getCallFlowVersion: () => 2,
    startCallMedia: async (id) => {
      events.push(['protect', id]);
      await promote();
    },
    stopCallMedia: (id) => events.push(['stop', id]),
  },
  rtc: {
    RTCPeerConnection: Peer,
    mediaDevices: {
      getUserMedia: (options) => {
        events.push(['capture', options]);
        return capture();
      },
    },
  },
};
globalThis.__notificationTest = environment;
const load = createNotificationLoader({
  '/rtc/native-webrtc.ts': 'export const getWebRTC = () => globalThis.__notificationTest.rtc;',
  '/services/ice-api.ts': 'export const getIceServers = async () => [];',
  '/services/call-permissions.ts': 'export const requestCallPermissions = async () => {};',
  '/services/call-sound-service.ts': 'export const stopCallSoundBeforeMedia = async () => {};',
});
const { createPeerSession } = await load('rtc/peer-session');
let active = true;
const callbacks = {
  callId: 'media-call',
  isActive: () => active,
  onCandidate() {},
  onStreams() {},
  onConnectionState() {},
  onDeviceEnded() {},
};
function setup(t) {
  events = [];
  promote = async () => {};
  capture = async () => stream;
  active = true;
  const session = createPeerSession();
  t.after(() => session.close());
  return session;
}
for (const media of ['audio', 'video']) {
  test(`${media} waits for foreground microphone protection before capture and releases it on hang-up`, async (t) => {
    const session = setup(t);
    let resolve;
    promote = () =>
      new Promise((done) => {
        resolve = done;
      });
    const opening = session.prepare(media, callbacks);
    await flush();
    assert.deepEqual(events, [['protect', 'media-call']]);
    resolve();
    await opening;
    assert.equal(events[1][0], 'capture');
    session.close();
    assert.deepEqual(events.at(-1), ['stop', 'media-call']);
  });
}
test('hanging up during native setup cannot start a late microphone capture', async (t) => {
  const session = setup(t);
  let resolve;
  promote = () =>
    new Promise((done) => {
      resolve = done;
    });
  const opening = session.prepare('audio', callbacks);
  await flush();
  session.close();
  active = false;
  resolve();
  await assert.rejects(opening, /finalizada/);
  assert.equal(events.filter((item) => item[0] === 'capture').length, 0);
});
test('capture failures release the native CPU protection immediately', async (t) => {
  const session = setup(t);
  capture = async () => {
    throw new Error('Capture failed');
  };
  await assert.rejects(session.prepare('video', callbacks), /Capture failed/);
  assert.deepEqual(events.at(-1), ['stop', 'media-call']);
});
