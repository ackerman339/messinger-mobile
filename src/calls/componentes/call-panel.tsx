import { Phone, Video, VideoOff } from 'lucide-react-native';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallPanel } from '../../hooks/use-call-panel';
import { COLORS } from '../../lib/constants';
import { CallControls } from './call-controls';
import { CallStream } from './call-stream';
import { getVideoStreamKey } from '../../rtc/video-stream';
import { useCallPanelVisibility } from '../../hooks/use-call-panel-visibility';

export function CallPanel() {
  const model = useCallPanel();
  const { call, terminal } = model;
  useCallPanelVisibility(call?.callId);
  const insets = useSafeAreaInsets();
  if (!call) return null;
  const video = call.media === 'video' && !!getVideoStreamKey(call.remote) && !terminal;
  return (
    <Modal
      visible
      animationType='slide'
      hardwareAccelerated
      statusBarTranslucent
      onRequestClose={() => {
        if (terminal) model.handleDismissCall();
      }}
    >
      <View
        className='flex-1 bg-bg-app'
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className='flex-row items-center justify-between px-6 pt-5'>
          <Text className='text-sm font-semibold text-text-primary'>messinger</Text>
          <View className='flex-row items-center gap-2'>
            {call.media === 'video' ? (
              <Video size={15} color={COLORS['text-secondary']} />
            ) : (
              <Phone size={15} color={COLORS['text-secondary']} />
            )}
            <Text className='text-xs text-text-secondary'>
              {call.media === 'video' ? 'Videollamada' : 'Llamada de voz'}
            </Text>
          </View>
        </View>
        <View className='items-center px-6 pt-8'>
          <Text className='text-center text-3xl font-medium text-text-primary'>
            {model.participantName}
          </Text>
          <Text accessibilityLiveRegion='polite' className='mt-2 text-base text-text-secondary'>
            {model.statusLabel}
          </Text>
        </View>
        <View className='m-6 flex-1 items-center justify-center overflow-hidden rounded-3xl bg-bg-chat'>
          {video ? (
            <CallStream stream={call.remote!} />
          ) : (
            <View className='h-36 w-36 items-center justify-center rounded-full bg-accent/20'>
              <Text className='text-5xl text-accent'>{model.initials}</Text>
            </View>
          )}
          {call.local && call.media === 'video' && !terminal && (
            <View className='absolute right-4 top-4 h-36 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-bg-chat'>
              {call.cameraOff ? (
                <VideoOff
                  size={30}
                  color={COLORS['text-secondary']}
                  accessibilityLabel='Cámara apagada'
                />
              ) : (
                <CallStream stream={call.local} local front={call.frontCamera !== false} />
              )}
            </View>
          )}
        </View>
        <View className='px-4 pb-8 pt-2'>
          {call.notice && (
            <Text className='mb-3 text-center text-sm text-text-secondary'>{call.notice}</Text>
          )}
          {[call.error, call.deviceError, model.native.error]
            .filter(Boolean)
            .map((message, index) => (
              <Text
                key={`${index}:${message}`}
                accessibilityRole='alert'
                className='mb-3 text-center text-sm text-danger'
              >
                {message}
              </Text>
            ))}
          <CallControls model={model} />
        </View>
      </View>
    </Modal>
  );
}
