import { Mic, Square, Trash2 } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

type VoiceRecorderProps = {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
};

export function VoiceRecorder({ isRecording, onStart, onStop, onCancel }: VoiceRecorderProps) {
  if (!isRecording) {
    return (
      <Pressable
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
        }}
        onPress={onStart}
        accessibilityLabel='Grabar nota de voz'
      >
        <Mic size={22} color='#64748b' />
      </Pressable>
    );
  }

  return (
    <XStack flex={1} height={44} items='center' gap='$2'>
      <Pressable
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
        }}
        onPress={onCancel}
        accessibilityLabel='Cancelar grabación'
      >
        <Trash2 size={22} color='#64748b' />
      </Pressable>

      <XStack flex={1} height={44} items='center' justify='center' gap='$2'>
        <YStack
          width={8}
          height={8}
          bg='$red10'
          style={{
            borderRadius: 4,
          }}
        />

        <Text fontSize='$3' color='$textPrimary'>
          Grabando...
        </Text>
      </XStack>

      <Pressable
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          backgroundColor: '#007AFF',
        }}
        onPress={onStop}
        accessibilityLabel='Detener y enviar nota de voz'
      >
        <Square size={18} color='white' fill='white' />
      </Pressable>
    </XStack>
  );
}
