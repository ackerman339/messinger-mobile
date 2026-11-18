import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, XStack, YStack } from 'tamagui';
import { COLORS } from '@/src/lib/constants';

export function GroupDialog({
  open,
  title,
  description,
  busy,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  function close() {
    if (!busy) onClose();
  }
  return (
    <Modal
      visible={open}
      transparent
      animationType='fade'
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(0,0,0,0.4)' },
          ]}
          onPress={close}
          accessible={false}
        />
        <SafeAreaView
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          pointerEvents='box-none'
        >
          <View
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90%',
              backgroundColor: COLORS['bg-app'],
              borderRadius: 16,
              padding: 20,
            }}
            accessibilityViewIsModal
          >
            <XStack items='center' justify='space-between' gap='$2'>
              <Text
                flex={1}
                accessibilityRole='header'
                fontSize='$5'
                fontWeight='600'
                color='$textPrimary'
              >
                {title}
              </Text>
              <Button
                circular
                size='$4'
                disabled={busy}
                onPress={close}
                accessibilityRole='button'
                accessibilityLabel='Cerrar'
              >
                <X size={20} color={COLORS['text-secondary']} />
              </Button>
            </XStack>
            <Text mt='$2' mb='$4' fontSize='$3' color='$textSecondary'>
              {description}
            </Text>
            <YStack shrink={1} gap='$3'>
              {children}
            </YStack>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
