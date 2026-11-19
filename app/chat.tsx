import { GroupCallProvider } from '@/src/group-calls/group-call-provider';
import { GroupCallPanel } from '@/src/group-calls/group-call-panel';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PortalHost, PortalProvider, YStack } from 'tamagui';

import { CallProvider } from '@/src/providers/call-provider';
import { CallPanel } from '@/src/calls/componentes/call-panel';
import { ChatHeader } from '@/src/components/chat-header';
import { ConversationList } from '@/src/components/conversations-list';
import { MessageComposer } from '@/src/components/message-composer';
import { MessageList } from '@/src/components/messages-list';
import { GroupInvitationPanel } from '@/src/components/group-invitation-panel';
import { useChatContext } from '@/src/contexts/chat-context';
import { AttachmentProvider } from '@/src/providers/attachment-provider';
import { ChatProvider } from '@/src/providers/chat-provider';
import { UserProvider } from '@/src/providers/user-provider';
import { COLORS } from '@/src/lib/constants';

function ChatContent() {
  const { activeConversation } = useChatContext();
  const isAndroid = Platform.OS === 'android';
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => isAndroid && Keyboard.isVisible(),
  );
  const hasAndroidComposer =
    isAndroid && !!activeConversation && !activeConversation.invitation;
  // Android's hide event can report a frame above the bottom of the screen.
  const keyboardBehavior =
    Platform.OS === 'ios' || keyboardVisible ? 'padding' : undefined;

  useEffect(() => {
    if (!isAndroid) return;

    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, [isAndroid]);

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
    <SafeAreaView
      edges={hasAndroidComposer ? ['top', 'left', 'right'] : undefined}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <ConversationList />
          {activeConversation && (
            <Animated.View
              key={activeConversation.id}
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
                {activeConversation.invitation ? (
                  <GroupInvitationPanel key={activeConversation.id} />
                ) : (
                  <>
                    <MessageList key={activeConversation.id} />
                    <SafeAreaView
                      edges={
                        hasAndroidComposer && !keyboardVisible ? ['bottom'] : []
                      }
                      style={{ backgroundColor: COLORS['bg-app'] }}
                    >
                      <MessageComposer key={activeConversation.id} />
                    </SafeAreaView>
                  </>
                )}
              </YStack>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function ChatPage() {
  return (
    <UserProvider>
      <ChatProvider>
        <CallProvider>
          <GroupCallProvider>
            <AttachmentProvider>
              <PortalProvider>
                <SafeAreaProvider>
                  <ChatContent />
                </SafeAreaProvider>
                <CallPanel />
                <GroupCallPanel />
                <PortalHost name='chat' />
              </PortalProvider>
            </AttachmentProvider>
          </GroupCallProvider>
        </CallProvider>
      </ChatProvider>
    </UserProvider>
  );
}
