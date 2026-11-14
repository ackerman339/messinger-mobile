import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { CallContext } from '../contexts/call-context';
import { useUserContext } from '../contexts/user-context';
import { useCallScreenAwake } from '../hooks/use-call-screen-awake';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { releaseChatRecorderForCall } from '../services/call-audio-ownership';
import { requestCallPermissions } from '../services/call-permissions';
import {
  callClient,
  getCallUser,
  hasActiveCall,
  receiveCallPush,
  respondToCall,
  setCallUser,
} from '../services/call-runtime';
import { nativeCallService } from '../services/native-call-service';
import { subscribeCallNotifications } from '../tasks/call-notifications';

import type { ReactNode } from 'react';
import type { CallMedia } from '../types/call';

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();
  const [call, setCall] = useState(callClient.getSnapshot);
  const [native, setNative] = useState(nativeCallService.getSnapshot);
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const userId = user?.id;
  const { incomingCall } = useLocalSearchParams<{ incomingCall?: string }>();
  useCallScreenAwake(call);
  useEffect(() => {
    if (
      !userId ||
      typeof incomingCall !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        incomingCall,
      )
    )
      return;
    // A full-screen launch only displays the panel. Accept/reject remain explicit actions.
    void receiveCallPush({
      type: 'call-incoming',
      callId: incomingCall.toLowerCase(),
      callerId: '',
      media: 'audio',
    }).catch(() => {});
  }, [incomingCall, userId]);

  useEffect(() => {
    const unsubscribe = callClient.subscribe(() =>
      setCall(callClient.getSnapshot()),
    );
    const unsubscribeNative = nativeCallService.subscribe(() =>
      setNative(nativeCallService.getSnapshot()),
    );
    return () => {
      unsubscribe();
      unsubscribeNative();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    setCallUser(hasNativeCalling() ? userId : undefined);
    if (!userId || !hasNativeCalling()) return;
    void nativeCallService.ensureReady().then(() => {
      nativeCallService.sync(callClient.getSnapshot());
      const incoming = nativeCallService.getIncoming();
      if (incoming) void receiveCallPush(incoming).catch(() => {});
    });
    const notifications = subscribeCallNotifications();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void nativeCallService
          .ensureReady()
          .then(() => nativeCallService.sync(callClient.getSnapshot()));
    });
    return () => {
      notifications();
      subscription.remove();
    };
  }, [userId, loading]);

  async function handleStartCall(
    participantId: string,
    media: CallMedia,
    conversationId?: string,
  ) {
    if (startInFlight.current || hasActiveCall() || !userId) return;
    if (!hasNativeCalling()) {
      Alert.alert(
        'Llamadas de Android',
        'Instala una nueva compilación de desarrollo con los módulos nativos de llamadas. Expo Go no los incluye.',
      );
      return;
    }
    startInFlight.current = true;
    setStarting(true);
    try {
      await releaseChatRecorderForCall();
      await requestCallPermissions(media, true);
      if (!(await nativeCallService.ensureReady()))
        throw new Error(
          nativeCallService.getSnapshot().error ??
            'No se pudo iniciar la integración de llamadas.',
        );
      if (getCallUser() !== userId) return;
      await nativeCallService.beginOutgoing(participantId, media);
      if (getCallUser() !== userId) return;
      callClient.start(participantId, media, user?.username, conversationId);
    } catch (error) {
      Alert.alert(
        'No se pudo iniciar la llamada',
        error instanceof Error ? error.message : 'Vuelve a intentarlo.',
      );
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  }

  function handleAcceptCall() {
    const snapshot = callClient.getSnapshot();
    if (!snapshot?.callId) return;
    void respondToCall(snapshot.callId, 'accept');
  }
  function handleRejectCall() {
    const snapshot = callClient.getSnapshot();
    if (snapshot?.callId) void respondToCall(snapshot.callId, 'reject');
  }
  function handleEndCall() {
    callClient.end();
  }
  function handleDismissCall() {
    callClient.dismiss();
  }
  function handleToggleMicrophone() {
    callClient.toggle('audio');
  }
  function handleToggleCamera() {
    callClient.toggle('video');
  }
  function handleSwitchCamera() {
    void callClient.switchCamera();
  }
  function handleToggleSpeaker() {
    void nativeCallService.toggleSpeaker();
  }

  return (
    <CallContext.Provider
      value={{
        call,
        native,
        starting,
        handleStartCall,
        handleAcceptCall,
        handleRejectCall,
        handleEndCall,
        handleDismissCall,
        handleToggleMicrophone,
        handleToggleCamera,
        handleSwitchCamera,
        handleToggleSpeaker,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
