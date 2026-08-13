import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

const config = createTamagui({
  ...defaultConfig,

  tokens: {
    ...defaultConfig.tokens,

    color: {
      accent: '#54a9eb',
      accentHover: '#4a99d6',

      bgApp: '#ffffff',
      bgSidebar: '#ffffff',
      bgChat: '#e6ebee',

      bgBubbleOwn: '#effdde',
      bgBubbleOther: '#ffffff',

      border: '#e5e7eb',

      textPrimary: '#000000',
      textSecondary: '#707579',

      online: '#4fae4e',
    },
  },
});

export type AppConfig = typeof config;
export default config;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}
