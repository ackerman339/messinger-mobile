import { httpClient } from '@/src/clients/http-client';

export interface MobilePushSubscriptionDto {
  token: string;
  platform: 'ANDROID' | 'IOS';
}

export const pushSubscriptionService = {
  subscribeMobile: (data: MobilePushSubscriptionDto) =>
    httpClient.post('/push/subscribe-mobile', data),

  unsubscribeMobile: (token: string) =>
    httpClient.delete('/push/unsubscribe-mobile', { data: { token } }),
};
