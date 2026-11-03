import { AxiosError } from 'axios';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Text, YStack } from 'tamagui';

import Logo from '@/assets/images/messinger-logo.svg';
import { authService } from '@/src/services/auth';

export default function AuthPage() {
  const [loginKey, setLoginKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    setSubmitting(true);

    try {
      await authService.signIn({ loginKey });
      router.replace('/chat');
    } catch (error: unknown) {
      if (!(error instanceof AxiosError)) {
        console.error(error);
        return;
      }

      setError('Clave de acceso inválida');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <YStack marginBlock={'auto'} p={'$4'} maxW={'$20'} bg={'white'} mx={'auto'}>
          {/* Logo / description */}
          <YStack items={'center'} marginBlockEnd={'$6'}>
            <YStack width={56} height={56} marginBlockEnd='$4' items='center' content='center'>
              <Logo width={56} height={56} />
            </YStack>

            <Text text={'center'} color={'$textSecondary'}>
              Usa tu clave de acceso para chatear.
            </Text>
          </YStack>

          {/* Form */}
          <YStack className='gap-4'>
            <YStack gap={'$3'} marginBlockEnd={'$4'}>
              <Text fontWeight={'bold'} color={'$textPrimary'} fontSize={'$2'}>
                Clave de acceso
              </Text>

              <Input
                height={44}
                width='100%'
                borderWidth={1}
                borderColor='$border'
                bg='white'
                px={12}
                fontSize={14}
                color='$textPrimary'
                value={loginKey}
                onChangeText={setLoginKey}
                placeholder='AABBCCDD'
                autoCapitalize='characters'
                autoCorrect={false}
              />
            </YStack>

            {/* Error */}
            {error ? (
              <Text color={'red'} marginBlockEnd={'$4'}>
                {error}
              </Text>
            ) : null}

            {/* Submit */}
            <Button
              height={'$5'}
              width={'100%'}
              bg='$accent'
              px={16}
              fontSize={14}
              fontWeight='600'
              color='white'
              disabled={submitting}
              onPress={handleSubmit}
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </YStack>
        </YStack>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
