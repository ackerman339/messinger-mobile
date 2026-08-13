import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';

import { ChatProvider } from '@/src/providers/chat-provider';
import { UserProvider } from '@/src/providers/user-provider';

export default function ChatPage() {
  return (
    <UserProvider>
      <ChatProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <YStack flex={1}>
            <Text>Chat Page</Text>
          </YStack>
        </SafeAreaView>
      </ChatProvider>
    </UserProvider>
  );
}
