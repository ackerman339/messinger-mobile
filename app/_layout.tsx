import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';
import '../global.css';
import config from '../tamagui.config';

export default function RootLayout() {
  return (
    <TamaguiProvider config={config} defaultTheme='light'>
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  );
}
