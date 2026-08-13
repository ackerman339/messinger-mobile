import { httpClient } from '@/src/clients/http-client';

import type { ApiResponse } from '@/src/types/service-response';
import type { User, UserRole } from '@/src/types/user';

export interface SignUpDto {
  username: string;
  role?: UserRole; // defaults to UserRole.USER on the server
}

export interface SignInDto {
  loginKey: string;
}

type SignUpResponse = Pick<User, 'username' | 'status' | 'loginKey'>;

export const authService = {
  signUp: async (data: SignUpDto) => {
    const response = await httpClient.post<ApiResponse<SignUpResponse>>('/sign-up', data);
    return response.data.result;
  },

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
