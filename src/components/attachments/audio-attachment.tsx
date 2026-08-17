import { useAudioPlayer } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { useAttachmentContext } from '@/src/contexts/attachment-context';

type AudioAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function AudioAttachment({ attachmentId, fileName }: AudioAttachmentProps) {
  const { getDownloadUrl, downloadAttachment, getLocalUri, getDownloadState, clearError } =
    useAttachmentContext();

  const localUri = getLocalUri(attachmentId, fileName);

  const state = getDownloadState(attachmentId);

  const [audioUri, setAudioUri] = useState<string | undefined>(localUri);

  useEffect(() => {
    let cancelled = false;

    async function downloadAudio() {
      try {
        clearError(attachmentId);

        if (localUri) {
          setAudioUri(localUri);
          return;
        }

        await getDownloadUrl(attachmentId);

        const uri = await downloadAttachment(attachmentId, fileName);

        if (!cancelled) {
          setAudioUri(uri);
        }
      } catch {
        // The provider already stores the error.
      }
    }

    downloadAudio();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, fileName, localUri, getDownloadUrl, downloadAttachment, clearError]);

  if (state.error) {
    return (
      <YStack width={240} bg='$bgApp' px='$3' py='$3'>
        <Text fontSize='$2' color='$red10'>
          {state.error}
        </Text>
      </YStack>
    );
  }

  if (!audioUri) {
    return (
      <XStack width={240} bg='$bgApp' px='$3' py='$3' items='center' gap='$3'>
        <ActivityIndicator />

        <Text fontSize='$3' color='$textSecondary'>
          Descargando audio...
        </Text>
      </XStack>
    );
  }

  return <DownloadedAudio uri={audioUri} fileName={fileName} />;
}

type DownloadedAudioProps = {
  uri: string;
  fileName: string;
};

function DownloadedAudio({ uri, fileName }: DownloadedAudioProps) {
  const player = useAudioPlayer(uri);

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      setIsPlaying(status.playing);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
      return;
    }

    player.play();
  };

  return (
    <XStack width={240} bg='$bgApp' px='$3' py='$2' items='center' gap='$3'>
      <Pressable onPress={togglePlayback}>
        <XStack width={40} height={40} bg='$accent' items='center' justify='center'>
          {isPlaying ? <Pause size={20} color='white' /> : <Play size={20} color='white' />}
        </XStack>
      </Pressable>

      <YStack flex={1} minW={0}>
        <Text fontSize='$3' color='$textPrimary' numberOfLines={1}>
          {fileName}
        </Text>

        <Text fontSize='$2' color='$textSecondary' numberOfLines={1}>
          Audio
        </Text>
      </YStack>
    </XStack>
  );
}
