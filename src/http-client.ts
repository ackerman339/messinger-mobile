import { create } from 'axios';
import { router } from 'expo-router';

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
    const accessToken = await tokenStorage.getAccessToken();

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
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
