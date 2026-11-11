import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { configureNotificationChannels, MESSAGE_CHANNEL } from './notification-channels';
import { parseMessageNotification } from './notification-data';
import {
  claimMessageNotification,
  forgetMessageNotification,
  getNotificationContext,
  isConversationVisible,
} from './notification-state';
import type { Conversation } from '../types/conversation';
import type { Pagination } from '../types/service-response';
import type { MessageNotificationData } from './notification-data';

export async function showMessageNotification(notification: {
  title: string;
  body: string;
  data: MessageNotificationData;
}) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  const context = getNotificationContext();
  if (!context.userId || context.loggedOut) return;
  const { messageId, conversationId } = notification.data;
  if (AppState.currentState === 'active' && isConversationVisible(conversationId)) {
    claimMessageNotification(messageId, 'local');
    return;
  }
  if (!claimMessageNotification(messageId, 'local')) return;
  const identifier = `messinger-message:${messageId}`;
  const live = () =>
    getNotificationContext().version === context.version && !getNotificationContext().loggedOut;
  try {
    await configureNotificationChannels();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted || !live()) return;
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (presented.some((item) => parseMessageNotification(item)?.messageId === messageId)) return;
    if (!live() || (AppState.currentState === 'active' && isConversationVisible(conversationId)))
      return;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: notification.title,
        body: notification.body,
        data: { ...notification.data },
        sound: 'default',
        autoDismiss: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: MESSAGE_CHANNEL } : null,
    });
    if (!live()) await Notifications.dismissNotificationAsync(identifier);
  } catch {
    if (live()) forgetMessageNotification(messageId);
  }
}

export async function dismissConversationNotifications(conversationId: string) {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((item) => parseMessageNotification(item)?.conversationId === conversationId)
      .map((item) => Notifications.dismissNotificationAsync(item.request.identifier)),
  );
}

/** Resolve only through the authenticated conversation list, including later pages. */
export async function findNotificationConversation(
  id: string,
  conversations: Map<string, Conversation>,
  fetchPage: (cursor: string | null) => Promise<Pagination<Conversation>>,
  isActive: () => boolean,
): Promise<Conversation | undefined> {
  const existing = conversations.get(id);
  if (existing) return isActive() ? existing : undefined;
  let cursor: string | null = null;
  const cursors = new Set<string>();
  while (isActive()) {
    const result = await fetchPage(cursor);
    if (!isActive()) return;
    const conversation = result.page.find((item) => item.id === id);
    if (conversation) return conversation;
    if (!result.nextCursor || cursors.has(result.nextCursor)) return;
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
}
