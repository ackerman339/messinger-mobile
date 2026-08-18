import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import * as SecureStore from 'expo-secure-store';

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './constants';

export async function hasAuthSession() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  return Boolean(accessToken && refreshToken);
}

export function formatLastSeen(date: string | Date) {
  const lastSeen = new Date(date);
  const days = differenceInDays(new Date(), lastSeen);

  if (days === 0) {
    return formatDistanceToNow(lastSeen, {
      locale: es,
    });
  }

  if (days === 1) {
    return `ayer a las ${format(lastSeen, 'HH:mm')}`;
  }

  if (days < 7) {
    return format(lastSeen, "EEEE 'a las' HH:mm", {
      locale: es,
    });
  }

  return format(lastSeen, "d 'de' MMMM 'a las' HH:mm", {
    locale: es,
  });
}
