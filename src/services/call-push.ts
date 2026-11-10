export interface CallPush {
  type: 'call-incoming' | 'call-missed';
  callId: string;
  callerId: string;
  media: 'audio' | 'video';
  expiresAt?: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts the Expo foreground, response and Android background payload envelopes. */
export function parseCallPush(payload: unknown, depth = 0): CallPush | undefined {
  if (depth > 6) return;
  if (typeof payload === 'string') {
    if (payload.length > 16384) return;
    try {
      return parseCallPush(JSON.parse(payload), depth + 1);
    } catch {
      return;
    }
  }
  if (!payload || typeof payload !== 'object') return;
  const value = payload as Record<string, unknown>;
  if (value.type === 'call-incoming' || value.type === 'call-missed') {
    if (typeof value.callId !== 'string' || !uuid.test(value.callId)) return;
    if (
      value.expiresAt != null &&
      (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))
    )
      return;
    return {
      type: value.type,
      callId: value.callId.toLowerCase(),
      callerId: typeof value.callerId === 'string' ? value.callerId : '',
      media: value.media === 'video' ? 'video' : 'audio',
      expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
    };
  }
  for (const key of ['dataString', 'body', 'data', 'notification', 'request', 'content']) {
    const call = parseCallPush(value[key], depth + 1);
    if (call) return call;
  }
}

export function isExpiredCallPush(call: CallPush) {
  return (
    call.type === 'call-incoming' && !!call.expiresAt && Date.parse(call.expiresAt) <= Date.now()
  );
}
