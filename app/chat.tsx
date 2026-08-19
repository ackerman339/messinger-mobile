import { KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PortalHost, PortalProvider, YStack } from 'tamagui';

import { ChatHeader } from '@/src/components/chat-header';
import { ConversationList } from '@/src/components/conversations-list';
import { MessageComposer } from '@/src/components/message-composer';
import { MessageList } from '@/src/components/messages-list';
import { useChatContext } from '@/src/contexts/chat-context';
import { AttachmentProvider } from '@/src/providers/attachment-provider';
import { ChatProvider } from '@/src/providers/chat-provider';
import { UserProvider } from '@/src/providers/user-provider';

function ChatContent() {
  const { activeConversation } = useChatContext();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(activeConversation ? 0 : 400, {
          duration: 250,
        }),
      },
    ],
  }));

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ConversationList />
        {activeConversation && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              },
              animatedStyle,
            ]}
          >
            <YStack flex={1} bg='$background'>
              <ChatHeader />
              <MessageList />
              <MessageComposer />
            </YStack>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function ChatPage() {
  return (
    <UserProvider>
      <ChatProvider>
        <AttachmentProvider>
          <PortalProvider>
            <ChatContent />
            <PortalHost name='chat' />
          </PortalProvider>
        </AttachmentProvider>
      </ChatProvider>
    </UserProvider>
  );
}
