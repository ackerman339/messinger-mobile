import { Check } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

export function GroupMemberOption({
  name,
  checked,
  disabled,
  single = false,
  status,
  onPress,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  single?: boolean;
  status?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityLabel={name}
      accessibilityState={{ checked, disabled }}
    >
      <XStack minH={52} items='center' gap='$3' py='$2'>
        <YStack
          width={24}
          height={24}
          rounded={single ? 12 : 4}
          borderWidth={1}
          borderColor={checked ? '$accent' : '$border'}
          bg={checked && !single ? '$accent' : 'transparent'}
          items='center'
          justify='center'
        >
          {checked && (single
            ? <YStack width={12} height={12} rounded={6} bg='$accent' />
            : <Check size={18} color='white' />)}
        </YStack>
        <Text flex={1} color='$textPrimary' fontSize='$3' numberOfLines={1}>
          {name}
        </Text>
        {status && (
          <Text color='$textSecondary' fontSize='$1'>{status}</Text>
        )}
      </XStack>
    </Pressable>
  );
}
