import { ActivityIndicator } from 'react-native';
import { XStack, YStack } from 'tamagui';

export function UploadingIndicator() {
  return (
    <XStack
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: 48,
        zIndex: 10,
      }}
      width='100%'
      justify='center'
    >
      <YStack items='center' py='$2' px='$2'>
        <ActivityIndicator size={28} color='$accent' />
      </YStack>
    </XStack>
  );
}
