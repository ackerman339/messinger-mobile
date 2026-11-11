import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationLoader, flush } from './notification-test-loader.mjs';

let synthetic;
let nativeQueue;
let nativeStreams;
let snapshots;
let captured;
let peers;
let sequence = 0;
function track(kind, remote = false) {
  return {
    kind,
    remote,
    id: `${kind}-${++sequence}`,
    readyState: 'live',
    enabled: true,
    stopped: 0,
    released: 0,
    stop() {
      this.stopped++;
      this.readyState = 'ended';
    },
    release() {
      this.released++;
    },
  };
}
class Stream {
  constructor(tracks = [], owner = 'synthetic') {
    this.tracks = [...tracks];
    this.owner = owner;
    this.url = `stream-${++sequence}`;
    this.released = 0;
    if (owner === 'native') nativeStreams.set(this.url, [...tracks]);
    else {
      synthetic.push(this);
      nativeQueue.push(() => nativeStreams.set(this.url, []));
    }
  }
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  addTrack(track) {
    assert.notEqual(
      this.owner,
      'native',
      'Do not reconstruct a track already included in a native event stream',
    );
    this.tracks.push(track);
    nativeQueue.push(() => nativeStreams.get(this.url).push(track));
  }
  appendNative(track) {
    this.tracks.push(track);
    nativeStreams.get(this.url).push(track);
  }
  toURL() {
    return this.url;
  }
  release(releaseTracks) {
    this.released++;
    this.releaseTracks = releaseTracks;
    nativeQueue.push(() => nativeStreams.delete(this.url));
  }
}
class Peer {
  constructor() {
    this.events = new Map();
    this.closed = 0;
    this.localTracks = [];
    peers.push(this);
  }
  addEventListener(name, callback) {
    this.events.set(name, callback);
  }
  addTrack(track, stream) {
    this.localTracks.push({ track, stream });
  }
  emitTrack(track, streams = []) {
    this.events.get('track')({ track, streams });
  }
  close() {
    this.closed++;
  }
  getStats() {
    return new Promise((resolve) => {
      nativeQueue.push({ resolve });
    });
  }
}
function flushNativeThroughStats() {
  while (nativeQueue.length) {
    const item = nativeQueue.shift();
    if (typeof item === 'function') item();
    else {
      item.resolve(new Map());
      return;
    }
  }
}
globalThis.__notificationTest = {
  rtc: {
    MediaStream: Stream,
    RTCPeerConnection: Peer,
    mediaDevices: { getUserMedia: async () => captured },
  },
};
const load = createNotificationLoader({
  '/rtc/native-webrtc.ts': 'export const getWebRTC = () => globalThis.__notificationTest.rtc;',
  '/services/ice-api.ts':
    'export const getIceServers = async () => [{urls:"stun:example.test:3478"}];',
  '/services/call-permissions.ts': 'export const requestCallPermissions = async () => {};',
  '/services/call-sound-service.ts': 'export const stopCallSoundBeforeMedia = async () => {};',
  '/services/native-call-media.ts':
    'export const startCallMedia = async () => {}; export const stopCallMedia = () => {};',
});
const { createPeerSession } = await load('rtc/peer-session');
const { getVideoStreamKey } = await load('rtc/video-stream');
async function setup(t, media = 'video') {
  synthetic = [];
  nativeQueue = [];
  nativeStreams = new Map();
  snapshots = [];
  peers = [];
  captured = new Stream([track('audio'), ...(media === 'video' ? [track('video')] : [])], 'native');
  const session = createPeerSession();
  await session.prepare(media, {
    callId: 'video-test-call',
    isActive: () => true,
    onCandidate() {},
    onConnectionState() {},
    onDeviceEnded() {},
    onStreams: (local, remote) => {
      snapshots.push({ local, remote });
    },
  });
  t.after(() => session.close());
  return { session, peer: peers[0] };
}
// Models Android RTCView's URL cache: setting the same URL does not look up its video track again.
function renderer() {
  let mountedKey;
  let streamURL;
  let video;
  return {
    update(stream) {
      const key = getVideoStreamKey(stream);
      if (!key) {
        mountedKey = undefined;
        streamURL = undefined;
        video = undefined;
        return;
      }
      if (key !== mountedKey) {
        mountedKey = key;
        streamURL = undefined;
      }
      if (streamURL === stream.toURL()) return;
      streamURL = stream.toURL();
      video = nativeStreams.get(streamURL)?.find((track) => track.kind === 'video');
    },
    get video() {
      return video;
    },
  };
}

test('video capture does not publish an empty remote stream or create a synthetic wrapper before track arrival', async (t) => {
  await setup(t);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].local, captured);
  assert.equal(snapshots[0].remote, undefined);
  assert.equal(synthetic.length, 0);
});
for (const role of ['caller', 'callee']) {
  test(`${role}: audio-first native events do not bind a blank RTCView before the video track arrives`, async (t) => {
    const { session, peer } = await setup(t);
    const view = renderer();
    const audio = track('audio', true);
    const remote = new Stream([audio], 'native');
    peer.emitTrack(audio, [remote]);
    view.update(snapshots.at(-1).remote);
    assert.equal(view.video, undefined);
    assert.equal(getVideoStreamKey(remote), undefined);
    const video = track('video', true);
    remote.appendNative(video);
    peer.emitTrack(video, [remote]);
    view.update(snapshots.at(-1).remote);
    assert.equal(session.remote, remote);
    assert.equal(view.video, video);
    assert.equal(synthetic.length, 0);
  });
}
test('a late audio-only stream cannot replace the remote video stream being rendered', async (t) => {
  const { session, peer } = await setup(t);
  const video = track('video', true);
  const remoteVideo = new Stream([video], 'native');
  peer.emitTrack(video, [remoteVideo]);
  const audio = track('audio', true);
  const remoteAudio = new Stream([audio], 'native');
  peer.emitTrack(audio, [remoteAudio]);
  assert.equal(session.remote, remoteVideo);
  assert.equal(getVideoStreamKey(session.remote), `${remoteVideo.toURL()}:${video.id}`);
});
test('the video-bearing native stream is selected when a track event includes multiple streams', async (t) => {
  const { session, peer } = await setup(t);
  const audio = track('audio', true);
  const video = track('video', true);
  const audioStream = new Stream([audio], 'native');
  const videoStream = new Stream([video], 'native');
  peer.emitTrack(video, [audioStream, videoStream]);
  assert.equal(session.remote, videoStream);
});
test('a replacement video track rebinds the native renderer even if its stream URL is unchanged', async (t) => {
  const { peer } = await setup(t);
  const first = track('video', true);
  const remote = new Stream([first], 'native');
  const view = renderer();
  peer.emitTrack(first, [remote]);
  view.update(remote);
  assert.equal(view.video, first);
  const firstKey = getVideoStreamKey(remote);
  first.readyState = 'ended';
  remote.tracks = [];
  nativeStreams.set(remote.toURL(), []);
  const replacement = track('video', true);
  remote.appendNative(replacement);
  peer.emitTrack(replacement, [remote]);
  view.update(remote);
  assert.notEqual(firstKey, getVideoStreamKey(remote));
  assert.equal(view.video, replacement);
});
test('streamless video is not published until native stream creation and track attachment finish', async (t) => {
  const { session, peer } = await setup(t);
  const video = track('video', true);
  const view = renderer();
  peer.emitTrack(video);
  assert.equal(session.remote, undefined);
  assert.equal(snapshots.length, 1);
  flushNativeThroughStats();
  await flush();
  view.update(session.remote);
  assert.equal(view.video, video);
  assert.equal(synthetic.length, 1);
});
test('overlapping streamless audio/video callbacks cannot publish a video track before its native attachment', async (t) => {
  const { session, peer } = await setup(t);
  const video = track('video', true);
  peer.emitTrack(track('audio', true));
  peer.emitTrack(video);
  flushNativeThroughStats();
  await flush();
  assert.equal(session.remote, undefined);
  flushNativeThroughStats();
  await flush();
  const view = renderer();
  view.update(session.remote);
  assert.equal(view.video, video);
});
test('a native video stream supersedes an in-flight synthetic fallback without being replaced by its late completion', async (t) => {
  const { session, peer } = await setup(t);
  peer.emitTrack(track('video', true));
  const video = track('video', true);
  const native = new Stream([video], 'native');
  peer.emitTrack(video, [native]);
  flushNativeThroughStats();
  await flush();
  assert.equal(session.remote, native);
});
test('hang-up drops late track and fallback completion callbacks and releases only owned media', async (t) => {
  const { session, peer } = await setup(t);
  const video = track('video', true);
  peer.emitTrack(video);
  const pending = synthetic[0];
  const before = snapshots.length;
  session.close();
  flushNativeThroughStats();
  await flush();
  peer.emitTrack(track('video', true));
  assert.equal(snapshots.length, before);
  assert.equal(session.remote, undefined);
  assert.equal(pending.released, 1);
  assert.equal(video.stopped, 0);
  assert.equal(video.released, 0);
  assert.ok(captured.getTracks().every((track) => track.stopped === 1 && track.released === 1));
});
test('native remote stream disposal remains owned by PeerConnection rather than the view wrapper', async (t) => {
  const { session, peer } = await setup(t);
  const video = track('video', true);
  const native = new Stream([video], 'native');
  peer.emitTrack(video, [native]);
  session.close();
  assert.equal(native.released, 0);
  assert.equal(peer.closed, 1);
});
test('voice-only remote audio continues without constructing a video renderer', async (t) => {
  const { session, peer } = await setup(t, 'audio');
  const audio = track('audio', true);
  const native = new Stream([audio], 'native');
  peer.emitTrack(audio, [native]);
  assert.equal(session.remote, native);
  assert.equal(getVideoStreamKey(native), undefined);
  assert.equal(peer.localTracks.length, 1);
  assert.equal(peer.localTracks[0].track.kind, 'audio');
});
