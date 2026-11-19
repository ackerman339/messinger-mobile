import { Phone, Users, Video } from 'lucide-react-native';
import { Pressable, Text } from 'react-native';
import { COLORS } from '../lib/constants';
import { useGroupCall } from './group-call-context';

export function GroupCallButtons() {
  const { available, active, busy, individualBusy, open } = useGroupCall();
  if (!available) return null;
  const disabled = busy || individualBusy;
  const iconClass =
    'h-10 w-10 items-center justify-center rounded-full active:bg-bg-chat disabled:opacity-40';

  return active ? (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel='Unirse a la llamada grupal'
      className='h-10 flex-row items-center justify-center gap-1 rounded-full bg-bg-chat px-2 disabled:opacity-40'
      disabled={disabled}
      onPress={() => open(active.media)}
    >
      <Users size={17} color={COLORS.accent} />
      <Text className='font-medium text-accent'>Unirse</Text>
    </Pressable>
  ) : (
    <>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Iniciar llamada grupal'
        className={iconClass}
        disabled={disabled}
        onPress={() => open('audio')}
      >
        <Phone size={20} color={COLORS.accent} />
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Iniciar videollamada grupal'
        className={iconClass}
        disabled={disabled}
        onPress={() => open('video')}
      >
        <Video size={22} color={COLORS.accent} />
      </Pressable>
    </>
  );
}
