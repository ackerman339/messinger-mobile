import { httpClient } from '@/src/clients/http-client';

export interface CallIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export async function getIceServers(): Promise<CallIceServer[]> {
  const { data } = await httpClient.get<{ iceServers: CallIceServer[] }>('/turn/credentials');
  return data.iceServers;
}
