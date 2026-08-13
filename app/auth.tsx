import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import Logo from '@/assets/messinger-logo.svg';
import { authService } from '@/src/services/auth';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [loginKey, setLoginKey] = useState('');
  const [username, setUsername] = useState('');
  const [createdLoginKey, setCreatedLoginKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignIn = mode === 'sign-in';

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setCreatedLoginKey('');
  }

  async function handleSubmit() {
    setError('');
    setCreatedLoginKey('');
    setSubmitting(true);

    try {
      if (mode === 'sign-in') {
        await authService.signIn({ loginKey });

        router.replace('/chat');
        return;
      }

      const response = await authService.signUp({ username });
      setCreatedLoginKey(response.loginKey);
    } catch (error: unknown) {
      console.error(error);

      setError(mode === 'sign-in' ? 'Clave de acceso inválida' : 'No se puede crear usuario');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <YStack marginBlock={'auto'} p={'$4'} maxW={'$20'} bg={'white'} mx={'auto'}>
      {/* Logo / description */}
      <YStack items={'center'} marginBlockEnd={'$6'}>
        <YStack width={56} height={56} marginBlockEnd='$4' items='center' content='center'>
          <Logo width={56} height={56} />
        </YStack>

        <Text text={'center'} color={'$textSecondary'}>
          {isSignIn
            ? 'Usa tu clave de acceso para chatear.'
            : 'Crea un nombre de usuario y guarda tu clave de acceso'}
        </Text>
      </YStack>

      {/* Tabs */}
      <XStack marginBlockEnd={'$4'} bg={'$gray3'} p={'$2'}>
        <Pressable className='flex-1' onPress={() => changeMode('sign-in')}>
          <View
            className={['items-center rounded-md px-3 py-2', isSignIn ? 'bg-white' : ''].join(' ')}
          >
            <Text
              fontWeight={isSignIn ? 'bold' : 'normal'}
              color={isSignIn ? '$textPrimary' : '$textSecondary'}
              fontSize={'$2'}
            >
              Entra
            </Text>
          </View>
        </Pressable>

        <Pressable className='flex-1' onPress={() => changeMode('sign-up')}>
          <View
            className={['items-center rounded-md px-3 py-2', !isSignIn ? 'bg-white' : ''].join(' ')}
          >
            <Text
              fontWeight={!isSignIn ? 'bold' : 'normal'}
              color={!isSignIn ? '$textPrimary' : '$textSecondary'}
              fontSize={'$2'}
            >
              Regístrate
            </Text>
          </View>
        </Pressable>
      </XStack>

      {/* Form */}
      <YStack className='gap-4'>
        {isSignIn ? (
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
        ) : (
          <YStack gap={'$3'} marginBlockEnd={'$4'}>
            <Text fontWeight={'bold'} color={'$textPrimary'} fontSize={'$2'}>
              Tu nombre de usuario
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
              value={username}
              onChangeText={setUsername}
              placeholder='John Doe'
              autoCapitalize='words'
              autoCorrect={false}
            />
          </YStack>
        )}

        {/* Created login key */}
        {createdLoginKey ? (
          <View className='rounded-lg border border-accent/30 bg-accent/10 p-3 mb-4'>
            <Text
              fontWeight={'normal'}
              color={'$textPrimary'}
              fontSize={'$2'}
              marginBlockEnd={'$2'}
            >
              Tu clave de acceso, no la pierdas!
            </Text>

            <XStack items='center' marginBlockStart='$1' gap='$2'>
              <Text flex={1} fontWeight='bold' fontSize='$2' color='$accent'>
                {createdLoginKey}
              </Text>

              <Button
                size='$1'
                background={'none'}
                onPress={async () => {
                  await Clipboard.setStringAsync(createdLoginKey);
                }}
                accessibilityLabel='Copiar clave de acceso'
              >
                <Copy size={16} color='#54a9eb' />
              </Button>
            </XStack>
          </View>
        ) : null}

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
          {submitting
            ? isSignIn
              ? 'Entrando...'
              : 'Creando cuenta...'
            : isSignIn
              ? 'Entrar'
              : 'Registrar'}
        </Button>
      </YStack>
    </YStack>
  );
}
