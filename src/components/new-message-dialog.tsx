import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Button, Dialog, Input, Text, XStack, YStack } from 'tamagui';

import { useChatContext } from '@/src/contexts/chat-context';
import { COLORS } from '@/src/lib/constants';
import { MessageComposer } from './message-composer';

type NewMessageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewMessageDialog({ open, onOpenChange }: NewMessageDialogProps) {
  const { getUserByCode, receiverId, handleReceiverId, unSetCurrentConversation } =
    useChatContext();

  const [userCode, setUserCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!userCode.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const user = await getUserByCode(userCode.trim());

      /**
       * This is important.
       *
       * A "new message" should not remain attached
       * to the conversation that was previously active.
       */
      handleReceiverId(user.id);
      unSetCurrentConversation();
    } catch {
      setError('No encontramos ese usuario');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(value: boolean) {
    onOpenChange(value);

    if (!value) {
      setUserCode('');
      handleReceiverId('');
      setError(null);
    }
  }

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key='overlay'
          opacity={0.4}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          bg='black'
        />

        <Dialog.Content
          key='content'
          bordered
          elevate
          width='90%'
          maxW={520}
          p={0}
          bg='$bgApp'
          self='center'
          my='auto'
        >
          <YStack>
            {/* Header */}
            <XStack
              height={56}
              items='center'
              justify='space-between'
              px='$4'
              borderBottomWidth={1}
              borderBottomColor='$border'
            >
              <Dialog.Title fontSize='$4' fontWeight='600' color='$textPrimary'>
                Nuevo mensaje
              </Dialog.Title>

              <Dialog.Close asChild>
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
                  accessibilityRole='button'
                  accessibilityLabel='Cerrar'
                >
                  <X size={24} color={COLORS['text-secondary']} />
                </Button>
              </Dialog.Close>
            </XStack>

            {!receiverId ? (
              <YStack p='$4'>
                {/* User code label */}
                <Text mb='$2' fontSize='$3' fontWeight='500' color='$textPrimary'>
                  Código del usuario
                </Text>

                {/* User code */}
                <Input
                  autoFocus
                  height={44}
                  value={userCode}
                  onChangeText={(value) => {
                    setUserCode(value);

                    /**
                     * Remove the previous error as soon
                     * as the user starts correcting the code.
                     */
                    if (error) {
                      setError(null);
                    }
                  }}
                  onSubmitEditing={handleContinue}
                  returnKeyType='go'
                  placeholder='Ej: A7F92K'
                  bg='$background'
                  borderWidth={0}
                  px='$3'
                  color='$textPrimary'
                  placeholderTextColor='$textSecondary'
                  focusStyle={{
                    borderWidth: 2,
                    borderColor: '$accent',
                  }}
                />

                {/* Error */}
                {error ? (
                  <Text mt='$2' fontSize='$3' color='$red10'>
                    {error}
                  </Text>
                ) : null}

                {/* Continue */}
                <Button
                  mt='$4'
                  height={44}
                  bg='$accent'
                  color='white'
                  fontSize='$3'
                  fontWeight='600'
                  disabled={loading || !userCode.trim()}
                  opacity={loading || !userCode.trim() ? 0.4 : 1}
                  onPress={handleContinue}
                >
                  {loading ? 'Buscando...' : 'Continuar'}
                </Button>
              </YStack>
            ) : (
              <MessageComposer />
            )}
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
