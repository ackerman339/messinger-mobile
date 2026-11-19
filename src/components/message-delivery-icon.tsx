import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from 'tamagui';
import { deliveryLabels } from '@/src/services/message-sync';

export function MessageDeliveryIcon({ status }: { status: keyof typeof deliveryLabels }) {
  const theme = useTheme();
  const Icon =
    status === 'PENDING'
      ? Clock
      : status === 'FAILED'
        ? CircleAlert
        : status === 'SENT'
          ? Check
          : CheckCheck;
  const color =
    status === 'READ'
      ? '#3b82f6'
      : status === 'FAILED'
        ? '#dc2626'
        : theme.textSecondary.val;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={deliveryLabels[status]}>
      <Icon size={15} strokeWidth={2} color={color} />
    </View>
  );
}
