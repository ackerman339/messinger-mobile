import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

export function CallControl({
  label,
  accessibilityLabel,
  children,
  onPress,
  variant = 'neutral',
  active = false,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  children: ReactNode;
  onPress: () => void;
  variant?: 'neutral' | 'accept' | 'end';
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <View className='min-w-0 flex-1 items-center gap-2'>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={onPress}
        className={`h-12 w-12 items-center justify-center rounded-full active:opacity-75 ${disabled ? 'opacity-40' : ''} ${variant === 'end' ? 'bg-danger' : variant === 'accept' || active ? 'bg-accent' : 'bg-bg-chat'}`}
      >
        {children}
      </Pressable>
      <Text className='text-center text-xs text-text-secondary'>{label}</Text>
    </View>
  );
}
