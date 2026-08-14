import { useAudioPlayer } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { Button, Text, XStack } from 'tamagui';

type AudioAttachmentProps = {
  url: string;
};

export function AudioAttachment({ url }: AudioAttachmentProps) {
  const player = useAudioPlayer(url);

  function togglePlayback() {
    if (player.playing) {
      player.pause();
      return;
    }

    player.play();
  }

  return (
    <XStack minW={180} maxW={260} items='center' gap='$3' bg='$background' px='$3' py='$2'>
      <Button
        circular
        size='$3'
        bg='$accent'
        color='white'
        onPress={togglePlayback}
        accessibilityLabel={player.playing ? 'Pausar audio' : 'Reproducir audio'}
      >
        {player.playing ? <Pause size={16} color='white' /> : <Play size={16} color='white' />}
      </Button>

      <Text flex={1} fontSize='$3' color='$textPrimary' numberOfLines={1}>
        Audio
      </Text>
    </XStack>
  );
}
