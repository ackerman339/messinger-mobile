import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { wsClient } from '../clients/websocket-client';
import { conversationService } from '../services/conversation';
import { getMessageNotification, parseMessageNotification } from '../services/notification-data';
import {
  dismissConversationNotifications,
  findNotificationConversation,
  showMessageNotification,
} from '../services/message-notification-service';
import { getNotificationContext, setVisibleConversation } from '../services/notification-state';
import { WS_SERVER_EVENTS } from '../types/websocket';
import type { Conversation } from '../types/conversation';

type Options = {
  userId?: string;
  conversations: Map<string, Conversation>;
  activeConversationId: string;
  openConversation: (id: string) => void;
  addConversation: (conversation: Conversation) => void;
};

export function useMessageNotifications(options: Options) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    setVisibleConversation(options.activeConversationId || undefined);
    if (options.userId && options.activeConversationId)
      void dismissConversationNotifications(options.activeConversationId).catch(() => {});
    return () => setVisibleConversation(undefined);
  }, [options.userId, options.activeConversationId]);

  useEffect(() => {
    if (!options.userId) return;
    const userId = options.userId;
    let disposed = false;
    let opening = 0;
    const handled = new Set<string>();
    const stopMessages = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      const notice = getMessageNotification(message, userId, latest.current.conversations);
      if (notice) void showMessageNotification(notice);
    });

    async function onResponse(response: Notifications.NotificationResponse) {
      const message = parseMessageNotification(response);
      if (!message || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const key = response.notification.request.identifier;
      if (handled.has(key)) return;
      handled.add(key);
      if (handled.size > 64) handled.delete(handled.values().next().value!);
      const operation = ++opening;
      const version = getNotificationContext().version;
      const live = () =>
        !disposed &&
        operation === opening &&
        getNotificationContext().userId === userId &&
        getNotificationContext().version === version;
      try {
        const conversation = await findNotificationConversation(
          message.conversationId,
          latest.current.conversations,
          (cursor) => conversationService.getBootstrap({ cursor, limit: 20 }),
          live,
        );
        if (!live()) return;
        if (!conversation) {
          Alert.alert('Conversación no disponible', 'Ya no tienes acceso a esta conversación.');
          return;
        }
        latest.current.addConversation(conversation);
        latest.current.openConversation(conversation.id);
        await dismissConversationNotifications(conversation.id);
        await conversationService.resetUnreadMessagesCount({ conversationId: conversation.id });
      } catch {
        if (live())
          Alert.alert(
            'No se pudo abrir el mensaje',
            'Vuelve a intentarlo desde tu lista de conversaciones.',
          );
      } finally {
        if (live()) await Notifications.clearLastNotificationResponseAsync();
      }
    }
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      void onResponse(response).catch(() => {});
    });
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response && !disposed) void onResponse(response).catch(() => {});
      })
      .catch(() => {});
    return () => {
      disposed = true;
      opening++;
      stopMessages();
      responses.remove();
    };
  }, [options.userId]);
}
