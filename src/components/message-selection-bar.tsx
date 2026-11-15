import { Copy, Trash2, X } from 'lucide-react-native';
import { ActivityIndicator } from 'react-native';
import { Button, Text, XStack } from 'tamagui';

type MessageSelectionBarProps = {
  count: number;
  isLoading: boolean;
  canCopy: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function MessageSelectionBar({
  count,
  isLoading,
  canCopy,
  canDelete,
  onCopy,
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
          {count} {count === 1 ? 'seleccionado' : 'seleccionados'}
        </Text>
      </XStack>

      <XStack items='center' gap='$2'>
        {canCopy && (
          <Button
            unstyled
            p='$2'
            disabled={isLoading}
            onPress={onCopy}
            accessibilityLabel='Copiar texto'
          >
            <Copy size={20} color='#000000' />
          </Button>
        )}
        {canDelete && (
          <Button
            unstyled
            p='$2'
            disabled={isLoading}
            onPress={onDelete}
            accessibilityLabel='Eliminar mensajes'
          >
            {isLoading ? (
              <ActivityIndicator />
            ) : (
              <Trash2 size={20} color='red' />
            )}
          </Button>
        )}
      </XStack>
    </XStack>
  );
}
