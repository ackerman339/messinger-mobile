import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PortalHost, PortalProvider, YStack } from 'tamagui';

import { ChatHeader } from '@/src/components/chat-header';
import { ConversationList } from '@/src/components/conversations-list';
import { MessageComposer } from '@/src/components/message-composer';
import { MessageList } from '@/src/components/messages-list';
import { useChatContext } from '@/src/contexts/chat-context';
import { ChatProvider } from '@/src/providers/chat-provider';
import { UserProvider } from '@/src/providers/user-provider';

function ChatContent() {
  const { activeConversation } = useChatContext();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {!activeConversation ? (
          <ConversationList />
        ) : (
          <YStack flex={1}>
            <ChatHeader />
            <MessageList />
            <MessageComposer />
          </YStack>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function ChatPage() {
  return (
    <UserProvider>
      <ChatProvider>
        <PortalProvider>
          <ChatContent />
          <PortalHost name='chat' />
        </PortalProvider>
      </ChatProvider>
    </UserProvider>
  );
}
