import { Platform } from 'react-native';
import type { PushTokenStage } from '../lib/notifications';
import { getPushToken } from '../lib/notifications';
import { pushSubscriptionService } from './push-subscription';

type Options = { requestPermission?: boolean; force?: boolean };
type Result = { status: 'registered' | 'unavailable' | 'cancelled' | 'failed' };
let owner: string | undefined;
let token: string | undefined;
let registeredAt = 0;
let generation = 0;
let stopped = false;
let pending: { userId: string; task: Promise<Result> } | undefined;

function reportFailure(stage: string, error: unknown) {
  const failure = error as
    | { code?: unknown; response?: { status?: unknown; data?: { error?: { code?: unknown } } } }
    | undefined;
  // SDK/Axios error objects can contain tokens and authorization headers. Log allowlisted fields only.
  const safeCode = (value: unknown) =>
    typeof value === 'string' && /^[a-zA-Z0-9_:.-]{1,100}$/.test(value) ? value : undefined;
  console.warn('[push] registration-failed', {
    stage,
    code: safeCode(failure?.code),
    status: typeof failure?.response?.status === 'number' ? failure.response.status : undefined,
    backendCode: safeCode(failure?.response?.data?.error?.code),
  });
}

/** Called once when sign-in or session restoration establishes the authenticated user. */
export function setPushRegistrationUser(userId: string) {
  if (owner !== userId || stopped) {
    owner = userId;
    generation++;
    registeredAt = 0;
  }
  stopped = false;
}

/** Shared by sign-in and UserProvider so navigating to chat does not cancel or duplicate registration. */
export function registerPushNotifications(userId: string, options: Options = {}): Promise<Result> {
  if (!userId || (Platform.OS !== 'android' && Platform.OS !== 'ios'))
    return Promise.resolve({ status: 'unavailable' });
  if (stopped || owner !== userId) return Promise.resolve({ status: 'cancelled' });
  const version = generation;
  const live = () => !stopped && owner === userId && version === generation;
  if (pending) {
    if (pending.userId === userId) return pending.task;
    return pending.task.then(() =>
      live() ? registerPushNotifications(userId, options) : { status: 'cancelled' },
    );
  }
  if (!options.force && registeredAt && Date.now() - registeredAt < 60_000)
    return Promise.resolve({ status: 'registered' });
  let stage: PushTokenStage | 'backend' = 'environment';
  const task = (async (): Promise<Result> => {
    try {
      const acquired = await getPushToken(options.requestPermission ?? false, (value) => {
        stage = value;
      });
      if (!live()) return { status: 'cancelled' };
      if (!acquired) return { status: 'unavailable' };
      // Remember a token before the POST, including when its response is lost, so logout can remove it.
      token = acquired;
      stage = 'backend';
      console.info('[push] subscribing-mobile');
      await pushSubscriptionService.subscribeMobile({
        token: acquired,
        platform: Platform.OS === 'android' ? 'ANDROID' : 'IOS',
      });
      if (!live()) return { status: 'cancelled' };
      registeredAt = Date.now();
      console.info('[push] subscribed-mobile');
      return { status: 'registered' };
    } catch (error) {
      if (!live()) return { status: 'cancelled' };
      reportFailure(stage, error);
      return { status: 'failed' };
    }
  })();
  pending = { userId, task };
  void task.then(() => {
    if (pending?.task === task) pending = undefined;
  });
  return task;
}

export async function unregisterPushNotifications() {
  stopped = true;
  generation++;
  owner = undefined;
  registeredAt = 0;
  await pending?.task;
  if (!token) return;
  try {
    await pushSubscriptionService.unsubscribeMobile(token);
    token = undefined;
  } catch (error) {
    reportFailure('unsubscribe', error);
  }
}
