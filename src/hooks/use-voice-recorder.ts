import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useState } from 'react';

export type VoiceRecording = {
  uri: string;
  name: string;
  size: number;
  type: string;
};

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [isRecording, setIsRecording] = useState(false);
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

    setRecording(null);
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!isRecording) {
      return null;
    }

    await recorder.stop();

    const uri = recorder.uri;

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
    if (isRecording) {
      await recorder.stop();
    }

    setIsRecording(false);
    setRecording(null);

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
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
