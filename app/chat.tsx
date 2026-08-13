import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';

import { UserProvider } from '@/src/providers/user-provider';

export default function ChatPage() {
  return (
    <UserProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <YStack flex={1}>
          <Text>Chat Page</Text>
        </YStack>
      </SafeAreaView>
    </UserProvider>
  );
}
