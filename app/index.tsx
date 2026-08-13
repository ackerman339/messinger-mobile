import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { YStack } from 'tamagui';

import { hasAuthSession } from '@/src/lib/utils';

export default function IndexPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function getAuth() {
      const isAuthenticated = await hasAuthSession();
      setAuthenticated(isAuthenticated);
    }

    getAuth();
  }, []);

  if (authenticated === null) {
    return (
      <YStack flex={1} items='center' content='center'>
        <ActivityIndicator />
      </YStack>
    );
  }

  return <Redirect href={authenticated ? '/chat' : '/auth'} />;
}
