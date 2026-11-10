import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { CallContext } from '../contexts/call-context';
import { useUserContext } from '../contexts/user-context';
import { useCallSound } from '../hooks/use-call-sound';
import { hasNativeCalling } from '../rtc/native-webrtc';
import { releaseChatRecorderForCall } from '../services/call-audio-ownership';
import { requestCallPermissions } from '../services/call-permissions';
import {
  callClient,
  getCallUser,
  hasActiveCall,
  respondToCall,
  setCallUser,
} from '../services/call-runtime';
import { nativeCallService } from '../services/native-call-service';
import { subscribeCallNotifications } from '../tasks/call-notifications';
import type { ReactNode } from 'react';
import type { CallMedia } from '../types/call';

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();
  const [call, setCall] = useState(callClient.getSnapshot);
  const [native, setNative] = useState(nativeCallService.getSnapshot);
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const userId = user?.id;

  useEffect(() => {
    const unsubscribe = callClient.subscribe(() => setCall(callClient.getSnapshot()));
    const unsubscribeNative = nativeCallService.subscribe(() =>
      setNative(nativeCallService.getSnapshot()),
    );
    return () => {
      unsubscribe();
      unsubscribeNative();
    };
  }, []);

  useEffect(() => {
    setCallUser(hasNativeCalling() ? userId : undefined);
    if (!userId || !hasNativeCalling()) return;
    void nativeCallService
      .ensureReady(true)
      .then(() => nativeCallService.sync(callClient.getSnapshot()));
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
  }, [userId]);

  useCallSound(call, !!call?.callId && native.ready && nativeCallService.hasCall(call.callId));

  async function handleStartCall(participantId: string, media: CallMedia) {
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
      await requestCallPermissions(media);
      if (!(await nativeCallService.ensureReady(true)))
        throw new Error('Habilita las llamadas de Messinger en los ajustes del teléfono.');
      if (getCallUser() !== userId) return;
      callClient.start(participantId, media);
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
    if (nativeCallService.hasCall(snapshot.callId)) nativeCallService.answer(snapshot.callId);
    else void respondToCall(snapshot.callId, 'accept');
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
