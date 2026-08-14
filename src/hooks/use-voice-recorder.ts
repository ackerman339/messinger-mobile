import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useRef, useState } from 'react';

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [isRecording, setIsRecording] = useState(false);

  const recordingUriRef = useRef<string | null>(null);

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

    recordingUriRef.current = uri;

    const file = new File(uri);

    return {
      uri,
      name: `voice-${randomUUID()}.m4a`,
      size: file.size,
      type: 'audio/m4a',
    };
  }

  async function cancelRecording() {
    if (isRecording) {
      await recorder.stop();
    }

    setIsRecording(false);

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });

    recordingUriRef.current = null;
  }

  return {
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
