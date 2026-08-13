import { create } from 'axios';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { tokenStorage } from '@/src/token-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_PREFIX = process.env.EXPO_PUBLIC_API_PREFIX;
const API_VERSION = process.env.EXPO_PUBLIC_API_VERSION;

const BASE_URL = `${API_URL}/${API_PREFIX}/${API_VERSION}`;

export const httpClient = create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-client-platform': Platform.OS,
    'x-client-platform-version': Platform.Version,
  },
});

httpClient.interceptors.request.use(
  async (config) => {
    const [accessToken, refreshToken] = await Promise.all([
      tokenStorage.getAccessToken(),
      tokenStorage.getRefreshToken(),
    ]);

    if (accessToken) {
      config.headers.authorization = `Bearer ${accessToken}`;
    }

    if (refreshToken) {
      config.headers['x-refresh-token'] = refreshToken;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

httpClient.interceptors.response.use(
  async (response) => {
    const accessToken = response.headers['x-access-token'];
    const refreshToken = response.headers['x-refresh-token'];

    if (accessToken && refreshToken) {
      await tokenStorage.setTokens(accessToken, refreshToken);
    }

    return response;
  },
  (error) => Promise.reject(error),
);

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      router.replace('/auth');
    }

    return Promise.reject(error);
  },
);
