import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { tokenStorage } from '../token-storage';
import { groupPushExpired, parseGroupCallPush } from '../group-calls/group-call-push';
import { isExpiredCallPush, parseCallPush } from './call-push';
import { parseMessageNotification, readNotificationData } from './notification-data';
import {
  claimMessageNotification,
  getNotificationContext,
  isCallNotificationBlocked,
  isConversationVisible,
  isLocalMessageNotification,
} from './notification-state';

let installed = false;
const hidden = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

/** Installed at entry, including headless starts, before any local notification is posted. */
export function installNotificationPresentation() {
  if (installed || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;
  installed = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const context = getNotificationContext();
      if (
        context.loggedOut ||
        !(await tokenStorage.getAccessToken()) ||
        getNotificationContext().version !== context.version
      )
        return hidden;
      const data = readNotificationData(notification);
      const groupCall = parseGroupCallPush(notification);
      if (groupCall?.type === 'group-call-closed') return hidden;
      if (groupCall?.type === 'group-call-incoming' && (
        groupPushExpired(groupCall) || isCallNotificationBlocked(groupCall.id) ||
        (AppState.currentState === 'active' && data?.localNotification !== 'group-call')
      )) return hidden;
      const call = parseCallPush(notification);
      if (call?.type === 'call-incoming') {
        if (isExpiredCallPush(call) || isCallNotificationBlocked(call.callId)) return hidden;
        // Replace the transport's generic push with the actionable local call notification.
        if (data?.localNotification !== 'call' && hasNativeCalling()) return hidden;
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldSetBadge: false,
          shouldPlaySound: !hasNativeCalling(),
          priority: Notifications.AndroidNotificationPriority.MAX,
        };
      }
      const message = parseMessageNotification(notification);
      if (message) {
        if (AppState.currentState === 'active' && isConversationVisible(message.conversationId)) {
          claimMessageNotification(message.messageId, 'remote');
          return hidden;
        }
        if (message.localNotification === 'message') {
          if (!isLocalMessageNotification(message.messageId)) return hidden;
        } else if (!claimMessageNotification(message.messageId, 'remote')) return hidden;
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !getNotificationContext().callInProgress,
        shouldSetBadge: false,
      };
    },
  });
}
