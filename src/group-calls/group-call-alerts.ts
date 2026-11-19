import { useEffect, useRef } from 'react';
import { createCallRingtone } from '../services/call-ringtone';
import { getNativeIncomingCall } from '../services/native-incoming-call';
import { getNativeCallTone } from '../services/native-call-tone';
import {
  dismissGroupCallNotification,
  showGroupCallNotification,
  subscribeGroupCallAnswers,
} from './group-call-notifications';
import type { GroupCall, GroupCallAction } from './types';

export function useGroupCallAlerts({
  incoming,
  outgoing,
  enabled,
  onAction,
  userId,
}: {
  incoming: (GroupCall & { groupName: string }) | null;
  outgoing: boolean;
  enabled: boolean;
  onAction: (action: GroupCallAction) => void;
  userId?: string;
}) {
  const id = incoming?.id;
  const conversationId = incoming?.conversationId;
  const groupName = incoming?.groupName;
  const callerId = incoming?.startedBy;
  const expiresAt = incoming?.ringingUntil;
  const media = incoming?.media;
  const displayed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (displayed.current && displayed.current !== id) {
      dismissGroupCallNotification(displayed.current);
    }
    displayed.current = id;
    if (!id || !conversationId || !groupName || !callerId || !expiresAt || !media) return;
    void showGroupCallNotification({
      id,
      conversationId,
      groupName,
      callerId,
      expiresAt,
      media,
      type: 'group-call-incoming',
    });
  }, [id, conversationId, groupName, callerId, expiresAt, media]);

  useEffect(() => {
    const sound = id
      ? getNativeIncomingCall()?.presentIncomingGroupCall
        ? undefined
        : 'incoming'
      : outgoing
        ? 'outgoing'
        : undefined;
    if (!sound) return;
    const native = getNativeCallTone();
    if (native) {
      const key = `group-${sound}:${id ?? Date.now()}`;
      native.startCallTone(
        key,
        id ?? '',
        sound,
        expiresAt ? Date.parse(expiresAt) : Date.now() + 60_000,
      );
      return () => native.stopCallTone(key);
    }
    try {
      return createCallRingtone(sound);
    } catch {
      // Playback failure must leave the call usable.
    }
  }, [id, outgoing, expiresAt]);

  useEffect(() => {
    if (enabled && userId) return subscribeGroupCallAnswers(userId, onAction);
  }, [enabled, userId, onAction]);
}
