import {
  Bluetooth,
  Headphones,
  Ear,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react-native';
import { View } from 'react-native';
import { CallControl } from './call-control';
import { COLORS } from '../../lib/constants';
import type { CallPanelModel } from '../../hooks/use-call-panel';

export function CallControls({ model }: { model: CallPanelModel }) {
  const { call } = model;
  if (!call) return null;
  return (
    <View className='flex-row items-start justify-center gap-2'>
      {model.canAccept && (
        <>
          <CallControl label='Rechazar' variant='end' onPress={model.handleRejectCall}>
            <PhoneOff color='white' size={27} />
          </CallControl>
          <CallControl label='Aceptar' variant='accept' onPress={model.handleAcceptCall}>
            {call.media === 'video' ? (
              <Video color='white' size={27} />
            ) : (
              <Phone color='white' size={27} />
            )}
          </CallControl>
        </>
      )}
      {model.canControlMedia && (
        <>
          {model.native.canToggleSpeaker && (
            <CallControl
              label={model.audioLabel}
              accessibilityLabel={model.native.speaker ? 'Usar auricular interno' : 'Usar altavoz'}
              active={model.native.speaker}
              disabled={model.native.changingRoute}
              onPress={model.handleToggleSpeaker}
            >
              {model.native.route === 'Bluetooth' ? (
                <Bluetooth size={24} color={COLORS['text-primary']} />
              ) : model.native.route === 'Headset' ? (
                <Headphones size={24} color={COLORS['text-primary']} />
              ) : model.native.speaker ? (
                <Volume2 size={24} color={COLORS['text-primary']} />
              ) : (
                <Ear size={24} color={COLORS['text-primary']} />
              )}
            </CallControl>
          )}
          <CallControl
            label={call.muted ? 'Silenciado' : 'Micrófono'}
            active={call.muted}
            onPress={model.handleToggleMicrophone}
          >
            {call.muted ? (
              <MicOff size={24} color={COLORS['text-primary']} />
            ) : (
              <Mic size={24} color={COLORS['text-primary']} />
            )}
          </CallControl>
          {call.media === 'video' && (
            <>
              <CallControl
                label='Cámara'
                active={call.cameraOff}
                disabled={call.switchingCamera}
                onPress={model.handleToggleCamera}
              >
                {call.cameraOff ? (
                  <VideoOff size={24} color={COLORS['text-primary']} />
                ) : (
                  <Video size={24} color={COLORS['text-primary']} />
                )}
              </CallControl>
              <CallControl
                label={call.switchingCamera ? 'Cambiando…' : 'Girar'}
                accessibilityLabel='Cambiar cámara'
                disabled={call.switchingCamera}
                onPress={model.handleSwitchCamera}
              >
                <SwitchCamera size={24} color={COLORS['text-primary']} />
              </CallControl>
            </>
          )}
        </>
      )}
      {model.canEnd && (
        <CallControl
          label={
            call.status === 'requesting' || call.status === 'ringing' ? 'Cancelar' : 'Finalizar'
          }
          variant='end'
          onPress={model.handleEndCall}
        >
          <PhoneOff size={27} color='white' />
        </CallControl>
      )}
      {model.terminal && (
        <CallControl label='Cerrar' onPress={model.handleDismissCall}>
          <X size={27} color={COLORS['text-primary']} />
        </CallControl>
      )}
    </View>
  );
}
