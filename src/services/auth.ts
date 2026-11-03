import { httpClient } from '@/src/clients/http-client';

import type { ApiResponse } from '@/src/types/service-response';
import type { User } from '@/src/types/user';

export interface SignInDto {
  loginKey: string;
}

export const authService = {
  signIn: async (data: SignInDto) => {
    const response = await httpClient.post<ApiResponse<User>>('mobile/sign-in', data);
    return response.data.result;
  },

  me: async () => {
    const response = await httpClient.get<ApiResponse<User>>('/me');
    return response.data.result;
  },

  logout: () => httpClient.post('/logout'),
  refresh: () => httpClient.post('/refresh'),
};
