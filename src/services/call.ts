import { httpClient } from '@/src/clients/http-client';
import type { CallHistoryItem } from '@/src/types/call';
import type {
  ApiResponse,
  Pagination,
  PaginationParams,
} from '@/src/types/service-response';

export const callService = {
  getHistories: async (params: PaginationParams) => {
    const response = await httpClient.get<
      ApiResponse<Pagination<CallHistoryItem>>
    >('/call/histories', { params });
    return response.data.result;
  },

  deleteHistory: async (callId: string) => {
    await httpClient.delete(`/call/histories/${callId}`);
  },

  deleteAllHistories: async () => {
    await httpClient.delete('/call/histories');
  },
};
