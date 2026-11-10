import { Phone, Video } from 'lucide-react-native';
import { Platform, Pressable, View } from 'react-native';
import { useCallContext } from '../../contexts/call-context';
import { isTerminal } from '../../types/call';
import { COLORS } from '../../lib/constants';

export function CallButtons({ participantId }: { participantId: string }) {
  const { call, starting, handleStartCall } = useCallContext();
  if (Platform.OS !== 'android') return null;
  const busy = starting || (!!call && (call.status === 'requesting' || !isTerminal(call.status)));
  return (
    <View className='flex-row'>
      <Pressable
        disabled={busy}
        accessibilityRole='button'
        accessibilityLabel='Llamar'
        onPress={() => handleStartCall(participantId, 'audio')}
        className={`h-10 w-10 items-center justify-center rounded-full active:bg-bg-chat ${busy ? 'opacity-40' : ''}`}
      >
        <Phone size={21} color={COLORS.accent} />
      </Pressable>
      <Pressable
        disabled={busy}
        accessibilityRole='button'
        accessibilityLabel='Videollamada'
        onPress={() => handleStartCall(participantId, 'video')}
        className={`h-10 w-10 items-center justify-center rounded-full active:bg-bg-chat ${busy ? 'opacity-40' : ''}`}
      >
        <Video size={22} color={COLORS.accent} />
      </Pressable>
    </View>
  );
}
