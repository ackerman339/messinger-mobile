import { Mic, Square, Trash2 } from 'lucide-react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { useChatContext } from '@/src/contexts/chat-context';
import { useVoiceRecorder } from '@/src/hooks/use-voice-recorder';
import { COLORS } from '@/src/lib/constants';

export function VoiceRecorder() {
  const { prepareAttachments, handleSendMessage } = useChatContext();

  const { isRecording, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  async function handleStart() {
    try {
      await startRecording();
    } catch (error) {
      console.error('[voice] failed to start recording:', error);
    }
  }

  async function handleStop() {
    try {
      const asset = await stopRecording();

      if (!asset) {
        return;
      }

      const attachments = await prepareAttachments([asset]);

      await handleSendMessage('Nota de voz', attachments);
    } catch (error) {
      console.error('[voice] failed to stop recording:', error);
    }
  }

  function handleCancel() {
    cancelRecording();
  }

  if (!isRecording) {
    return (
      <Button
        circular
        size='$3'
        unstyled
        items='center'
        justify='center'
        bg='transparent'
        pressStyle={{
          bg: '$backgroundHover',
        }}
        onPress={handleStart}
        accessibilityLabel='Grabar nota de voz'
      >
        <Mic size={22} color={COLORS['text-secondary']} />
      </Button>
    );
  }

  return (
    <XStack items='center' gap='$2'>
      <Button
        circular
        size='$4'
        unstyled
        items='center'
        justify='center'
        bg='transparent'
        pressStyle={{
          bg: '$backgroundHover',
        }}
        onPress={handleCancel}
        accessibilityLabel='Cancelar grabación'
      >
        <Trash2 size={22} color={COLORS['text-secondary']} />
      </Button>

      <XStack flex={1} items='center' justify='center' gap='$2'>
        <YStack width={8} height={8} bg='$red10' />

        <Text fontSize='$3' color='$textPrimary'>
          Grabando...
        </Text>
      </XStack>

      <Button
        circular
        size='$4'
        unstyled
        items='center'
        justify='center'
        bg='$accent'
        pressStyle={{
          opacity: 0.8,
        }}
        onPress={handleStop}
        accessibilityLabel='Detener grabación'
      >
        <Square size={18} color='white' fill='white' />
      </Button>
    </XStack>
  );
}
