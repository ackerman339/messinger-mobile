import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { registerChatRecorder } from '../services/call-audio-ownership';

export type VoiceRecording = {
  uri: string;
  name: string;
  size: number;
  type: string;
};

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef(false);
  const unregister = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => unregister.current?.(), []);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);

  async function startRecording() {
    const status = await AudioModule.requestRecordingPermissionsAsync();

    if (!status.granted) {
      throw new Error('Audio recording permission denied');
    }

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();
    recordingRef.current = true;
    unregister.current = registerChatRecorder(cancelRecording);

    setRecording(null);
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!recordingRef.current) {
      return null;
    }

    await recorder.stop();

    const uri = recorder.uri;

    recordingRef.current = false;
    unregister.current?.(); unregister.current = undefined;
    setIsRecording(false);

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });

    if (!uri) {
      return null;
    }

    const file = new File(uri);

    const voiceRecording: VoiceRecording = {
      uri,
      name: `voice-${randomUUID()}.m4a`,
      size: file.size,
      type: 'audio/m4a',
    };

    setRecording(voiceRecording);

    return voiceRecording;
  }

  async function cancelRecording() {
    try {
      if (recordingRef.current) await recorder.stop();
    } finally {
      recordingRef.current = false;
      unregister.current?.(); unregister.current = undefined;
      setIsRecording(false);
      setRecording(null);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    }
  }

  function deleteRecording() {
    setRecording(null);
  }

  return {
    isRecording,
    recording,
    startRecording,
    stopRecording,
    cancelRecording,
    deleteRecording,
  };
}
