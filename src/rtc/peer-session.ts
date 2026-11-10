import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc';
import { getWebRTC } from './native-webrtc';
import { getIceServers } from '../services/ice-api';
import { requestCallPermissions } from '../services/call-permissions';
import type { CallIceCandidate, CallMedia } from '../types/call';

interface PeerCallbacks {
  isActive: () => boolean;
  onCandidate: (candidate: CallIceCandidate | null) => void;
  onStreams: (local: MediaStream, remote: MediaStream) => void;
  onConnectionState: (state: string) => void;
  onDeviceEnded: (kind: string) => void;
}

function release(stream?: MediaStream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.onended = null;
    if (!track.remote) {
      track.stop();
      track.release();
    }
  });
  stream.release(false);
}

/** Android media resources, independent of signaling and React components. */
export function createPeerSession() {
  let peer: RTCPeerConnection | undefined;
  let local: MediaStream | undefined;
  let remote: MediaStream | undefined;
  let preparing: Promise<RTCPeerConnection> | undefined;
  let generation = 0;
  let frontCamera = true;

  function prepare(media: CallMedia, callbacks: PeerCallbacks) {
    if (peer) return Promise.resolve(peer);
    if (preparing) return preparing;
    const version = generation;
    const active = () => version === generation && callbacks.isActive();
    preparing = open(media, callbacks, active).finally(() => {
      if (version === generation) preparing = undefined;
    });
    return preparing;
  }

  async function open(media: CallMedia, callbacks: PeerCallbacks, active: () => boolean) {
    const rtc = getWebRTC();
    await requestCallPermissions(media);
    const iceServers = await getIceServers();
    if (!active()) throw new Error('Sesión finalizada');
    const captured = await rtc.mediaDevices.getUserMedia({
      audio: true,
      video:
        media === 'video' ? { facingMode: 'user', width: 640, height: 480, frameRate: 30 } : false,
    });
    if (!active()) {
      release(captured);
      throw new Error('Sesión finalizada');
    }
    local = captured;
    try {
      const connection = new rtc.RTCPeerConnection({ iceServers });
      peer = connection;
      const received = new rtc.MediaStream();
      remote = received;
      connection.addEventListener('icecandidate', (event) => {
        if (active()) callbacks.onCandidate(event.candidate?.toJSON() ?? null);
      });
      connection.addEventListener('track', (event) => {
        if (!active() || !event.track) return;
        const track = event.track;
        if (!received.getTracks().some((item) => item.id === track.id)) received.addTrack(track);
        callbacks.onStreams(captured, received);
      });
      connection.addEventListener('connectionstatechange', () => {
        if (active()) callbacks.onConnectionState(connection.connectionState);
      });
      captured.getTracks().forEach((track) => {
        connection.addTrack(track, captured);
        track.onended = () => {
          if (active()) callbacks.onDeviceEnded(track.kind);
        };
      });
      callbacks.onStreams(captured, received);
      return connection;
    } catch (error) {
      close();
      throw error;
    }
  }

  function toggle(kind: 'audio' | 'video') {
    const tracks =
      local?.getTracks().filter((track) => track.kind === kind && track.readyState === 'live') ??
      [];
    if (!tracks.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    return enabled;
  }

  async function switchCamera() {
    const camera = local?.getVideoTracks()[0];
    const version = generation;
    if (!camera || camera.readyState !== 'live') throw new Error('La cámara no está disponible.');
    const next = !frontCamera;
    await camera.applyConstraints({
      facingMode: next ? 'user' : 'environment',
      width: 640,
      height: 480,
      frameRate: 30,
    });
    if (version === generation) frontCamera = next;
    return frontCamera;
  }

  function close() {
    generation++;
    peer?.close();
    peer = undefined;
    release(local);
    release(remote);
    local = undefined;
    remote = undefined;
    preparing = undefined;
  }

  return {
    prepare,
    toggle,
    switchCamera,
    close,
    get peer() {
      return peer;
    },
    get local() {
      return local;
    },
    get remote() {
      return remote;
    },
  };
}
