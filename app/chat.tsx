import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';

export default function ChatPage() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1}>
        <Text>Chat Page</Text>
      </YStack>
    </SafeAreaView>
  );
}
