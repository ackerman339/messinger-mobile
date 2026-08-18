import * as Clipboard from 'expo-clipboard';
import { Copy, LogOut, Menu, MessageCircle } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Button, Popover, Separator, Text, YStack } from 'tamagui';

import { useUserContext } from '@/src/contexts/user-context';
import { COLORS } from '@/src/lib/constants';
import { NewMessageDialog } from './new-message-dialog';

export function ChatMenu() {
  const { user, logout } = useUserContext();
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleCopyUserCode() {
    if (!user?.userCode) return;

    await Clipboard.setStringAsync(user.userCode);
    setMenuOpen(false);
  }

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
  }

  function handleNewMessage() {
    setMenuOpen(false);
    setNewMessageOpen(true);
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen} placement='bottom-start'>
        <Popover.Trigger asChild>
          <Button
            circular
            size='$4'
            unstyled
            items='center'
            justify='center'
            bg='transparent'
            pressStyle={{
              bg: '$backgroundHover',
            }}
            accessibilityRole='button'
            accessibilityLabel='Abrir menú'
            accessibilityHint='Abre las opciones de conversación'
          >
            <Menu size={22} color={COLORS['text-secondary']} />
          </Button>
        </Popover.Trigger>

        <Popover.Content
          width={208}
          p='$1'
          borderWidth={1}
          borderColor='$border'
          bg='$bgApp'
          elevation='$4'
        >
          <YStack>
            <MenuItem
              icon={<MessageCircle size={18} color={COLORS['text-primary']} />}
              label='Nuevo mensaje'
              onPress={handleNewMessage}
            />

            <MenuItem
              icon={<Copy size={18} color={COLORS['text-primary']} />}
              label='Copiar tu código de usuario'
              onPress={handleCopyUserCode}
            />

            <Separator my='$1' bg='$border' />

            <MenuItem
              icon={<LogOut size={18} color='red' />}
              label='Cerrar sesión'
              color='$red10'
              onPress={handleLogout}
            />
          </YStack>
        </Popover.Content>
      </Popover>

      <NewMessageDialog open={newMessageOpen} onOpenChange={setNewMessageOpen} />
    </>
  );
}

type MenuItemProps = {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  color?: '$textPrimary' | '$red10';
};

function MenuItem({ icon, label, onPress, color = '$textPrimary' }: MenuItemProps) {
  return (
    <Button
      unstyled
      width='100%'
      minH={40}
      flexDirection='row'
      items='center'
      gap='$3'
      px='$3'
      py='$2'
      bg='transparent'
      pressStyle={{
        bg: '$backgroundHover',
      }}
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
    >
      {icon}

      <Text flex={1} fontSize='$3' color={color}>
        {label}
      </Text>
    </Button>
  );
}
