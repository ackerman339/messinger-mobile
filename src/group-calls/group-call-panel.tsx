import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from 'lucide-react-native';
import { ConnectionState, Track } from 'livekit-client';
import { useGroupCall } from './group-call-context';
import type { GroupCallView } from './group-call-context';
import { getLiveKitNative, requestGroupMediaPermission } from './room-platform';
import { useGroupRoom } from './use-group-room';
import { COLORS } from '../lib/constants';

function ConnectedPanel({ view }: { view: GroupCallView }) {
  const { room, call, title, preparingMedia, initialMediaError } = view;
  const { canEnd, ending, end, leave, error } = useGroupCall();
  const {
    state,
    cameraEnabled,
    microphoneEnabled,
    participants,
    mediaError,
    changing,
    toggleMedia,
  } = useGroupRoom(room);
  const { VideoTrack } = getLiveKitNative();
  const { top, bottom } = useSafeAreaInsets();
  const [minimized, setMinimized] = useState(false);
  const connected = state === ConnectionState.Connected;
  const video = call.media === 'video';
  const status = connected
    ? `${participants.length} en la llamada`
    : state === ConnectionState.Reconnecting ||
        state === ConnectionState.SignalReconnecting
      ? 'Reconectando…'
      : 'Conectando…';
  const MicIcon = microphoneEnabled ? Mic : MicOff;
  const CameraIcon = cameraEnabled ? Video : VideoOff;
  const actionClass =
    'min-h-11 flex-row items-center justify-center gap-2 rounded-lg bg-bg-chat px-3 py-2 disabled:opacity-40';

  return (
    <>
      {minimized && (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Volver a la llamada grupal'
          className='absolute left-3 right-3 z-50 flex-row items-center gap-3 rounded-xl bg-bg-app p-3 shadow-lg'
          style={{ bottom: bottom + 78 }}
          onPress={() => setMinimized(false)}
        >
          <Users size={20} color={COLORS.accent} />
          <Text className='flex-1 font-semibold text-text-primary' numberOfLines={1}>
            {title} · {status}
          </Text>
          <Text className='font-semibold text-accent'>Volver</Text>
        </Pressable>
      )}
      <Modal
        visible={!minimized}
        animationType='slide'
        hardwareAccelerated
        statusBarTranslucent
        onRequestClose={() => setMinimized(true)}
      >
        <View
          className='flex-1 bg-bg-app px-4'
          style={{ paddingTop: top + 12, paddingBottom: bottom + 12 }}
        >
          <View className='flex-row items-center gap-3 border-b border-border pb-3'>
            <View className='flex-1'>
              <Text className='text-lg font-semibold text-text-primary' numberOfLines={1}>
                {title}
              </Text>
              <Text
                className='text-sm text-text-secondary'
                accessibilityLiveRegion='polite'
              >
                {video ? 'Videollamada grupal' : 'Llamada grupal'} · {status}
              </Text>
            </View>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel='Minimizar llamada'
              className='h-11 w-11 items-center justify-center rounded-full bg-bg-chat'
              onPress={() => setMinimized(true)}
            >
              <ChevronDown size={22} color={COLORS['text-secondary']} />
            </Pressable>
          </View>
          <ScrollView
            className='flex-1'
            contentContainerClassName='flex-row flex-wrap py-3'
          >
            {connected &&
              participants.map(
                ({ identity, name, participant, camera, microphoneEnabled: hasMic }) => (
                  <View key={identity} className='w-1/2 p-1'>
                    <View className='aspect-square items-center justify-center overflow-hidden rounded-xl bg-bg-chat'>
                      {camera?.videoTrack && !camera.isMuted ? (
                        <VideoTrack
                          trackRef={{
                            participant,
                            publication: camera,
                            source: Track.Source.Camera,
                          }}
                          mirror={participant.isLocal}
                          style={{ width: '100%', height: '100%' }}
                        />
                      ) : (
                        <Text className='mb-6 rounded-full bg-bg-app px-3 py-2 text-lg font-semibold text-accent'>
                          {name.slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                      <View className='absolute bottom-2 left-2 right-2 flex-row items-center gap-1 rounded bg-black/70 px-2 py-1'>
                        <Text className='flex-1 text-xs text-white' numberOfLines={1}>
                          {participant.isLocal ? 'Tú' : name}
                        </Text>
                        {!hasMic && (
                          <MicOff
                            size={12}
                            color='white'
                            accessibilityLabel='Micrófono apagado'
                          />
                        )}
                      </View>
                    </View>
                  </View>
                ),
              )}
          </ScrollView>
          {(mediaError || error || initialMediaError) && (
            <Text className='mb-2 text-sm text-red-500' accessibilityLiveRegion='polite'>
              {mediaError || error || initialMediaError}
            </Text>
          )}
          <View className='flex-row flex-wrap gap-2'>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={
                microphoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'
              }
              className={actionClass}
              disabled={!connected || preparingMedia || changing || ending}
              onPress={() => void toggleMedia('microphone', requestGroupMediaPermission)}
            >
              <MicIcon size={21} color={COLORS['text-primary']} />
            </Pressable>
            {video && (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={cameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
                className={actionClass}
                disabled={!connected || preparingMedia || changing || ending}
                onPress={() => void toggleMedia('camera', requestGroupMediaPermission)}
              >
                <CameraIcon size={21} color={COLORS['text-primary']} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole='button'
              className={actionClass}
              disabled={ending}
              onPress={leave}
            >
              <PhoneOff size={18} color='#ef4444' />
              <Text className='font-medium text-red-500'>Salir</Text>
            </Pressable>
            {canEnd && (
              <Pressable
                accessibilityRole='button'
                className={actionClass}
                disabled={ending}
                onPress={() =>
                  Alert.alert(
                    'Finalizar la llamada',
                    'Todos los participantes se desconectarán.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Finalizar para todos',
                        style: 'destructive',
                        onPress: end,
                      },
                    ],
                  )
                }
              >
                <Text className='font-medium text-red-500'>
                  {ending ? 'Finalizando…' : 'Finalizar para todos'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export function GroupCallPanel() {
  const {
    view,
    screen,
    incoming,
    error,
    clearError,
    leave,
    acceptIncoming,
    dismissIncoming,
  } = useGroupCall();
  const { top, bottom } = useSafeAreaInsets();
  if (view) return <ConnectedPanel key={view.call.id} view={view} />;

  const details = screen ?? incoming;
  if (!details) return null;
  const video = details.media === 'video';
  const type = video ? 'Videollamada grupal' : 'Llamada grupal';
  const Icon = video ? Video : Phone;
  const offer = !screen && !!incoming;
  const dismiss = offer ? dismissIncoming : error ? clearError : leave;

  return (
    <Modal
      visible
      animationType='slide'
      hardwareAccelerated
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View
        className='flex-1 bg-bg-app px-6'
        style={{ paddingTop: top + 32, paddingBottom: bottom + 24 }}
      >
        <Text className='text-center text-3xl font-medium text-text-primary'>
          {details.title}
        </Text>
        <Text
          className='mt-2 text-center text-base text-text-secondary'
          accessibilityLiveRegion='polite'
        >
          {offer || error ? type : `${type} · Conectando…`}
        </Text>
        <View className='flex-1 items-center justify-center'>
          <View className='h-32 w-32 items-center justify-center rounded-full bg-accent/20'>
            <Icon size={42} color={COLORS.accent} />
          </View>
        </View>
        {error && (
          <Text accessibilityRole='alert' className='mb-4 text-center text-danger'>
            {error}
          </Text>
        )}
        <View className='flex-row justify-center gap-3'>
          {offer && (
            <Pressable
              accessibilityRole='button'
              className='rounded-full bg-accent px-5 py-3'
              onPress={acceptIncoming}
            >
              <Text className='font-semibold text-white'>Aceptar</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole='button'
            className='rounded-full bg-bg-chat px-5 py-3'
            onPress={dismiss}
          >
            <Text className='font-medium text-text-primary'>
              {offer ? 'Rechazar' : error ? 'Cerrar' : 'Cancelar'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
