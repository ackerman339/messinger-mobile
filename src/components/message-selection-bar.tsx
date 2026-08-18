import { Trash2, X } from 'lucide-react-native';
import { ActivityIndicator } from 'react-native';
import { Button, Text, XStack } from 'tamagui';

type MessageSelectionBarProps = {
  count: number;
  isLoading: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function MessageSelectionBar({
  count,
  isLoading,
  onDelete,
  onClose,
}: MessageSelectionBarProps) {
  return (
    <XStack
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        zIndex: 10,
        borderBottomWidth: 1,
        borderBottomColor: '$border',
        elevation: 4,
      }}
      items='center'
      justify='space-between'
      px='$4'
      bg='$bgApp'
    >
      <XStack items='center' gap='$3'>
        <Button
          circular
          size='$3'
          unstyled
          items='center'
          justify='center'
          bg='transparent'
          pressStyle={{
            bg: '$backgroundHover',
          }}
          onPress={onClose}
          accessibilityLabel='Cancelar selección'
        >
          <X size={20} color='$textPrimary' />
        </Button>

        <Text fontSize='$3' fontWeight='500' color='$textPrimary'>
          {count} {count === 1 ? 'mensaje seleccionado' : 'mensajes seleccionados'}
        </Text>
      </XStack>

      <Button
        unstyled
        flexDirection='row'
        items='center'
        gap='$2'
        px='$3'
        py='$2'
        bg='transparent'
        disabled={isLoading}
        opacity={isLoading ? 0.5 : 1}
        pressStyle={{
          bg: '$red5',
        }}
        onPress={onDelete}
        accessibilityLabel='Eliminar mensajes'
      >
        {isLoading ? <ActivityIndicator /> : <Trash2 size={20} color='red' />}

        <Text fontSize='$3' color='$red10'>
          Eliminar
        </Text>
      </Button>
    </XStack>
  );
}
