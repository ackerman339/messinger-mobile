import { httpClient } from '@/src/clients/http-client';

import type { ApiResponse } from '@/src/types/service-response';
import type { User } from '@/src/types/user';

export interface GetUserByCodeDto {
  userCode: string;
}

export type Response = Pick<User, 'id' | 'username'>;

export const userService = {
  getUserByCode: (data: GetUserByCodeDto) =>
    httpClient.get<ApiResponse<Response>>('/user-code', { params: data }),
};
