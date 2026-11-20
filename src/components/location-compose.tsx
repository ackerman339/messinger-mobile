import { Modal } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import { useLocationDraft } from '../hooks/use-location-draft';
import { LOCATION_DURATIONS } from '../types/location';
import type { LocationInput } from '../types/location';
import { LocationMap } from './location-map';

export function LocationCompose({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (location: LocationInput) => boolean;
}) {
  const { point, mode, setMode, duration, setDuration, error, locate, submit } =
    useLocationDraft(onSend);

  return (
    <Modal transparent visible onRequestClose={onClose} animationType='fade'>
      <YStack flex={1} items='center' justify='center' bg='rgba(0,0,0,0.45)' px='$3'>
        <YStack
          accessibilityViewIsModal
          width='100%'
          maxW={400}
          bg='$bgApp'
          rounded='$4'
          p='$4'
          gap='$3'
        >
          <Text fontWeight='600' fontSize='$5' color='$textPrimary'>
            Compartir ubicación
          </Text>
          {point ? (
            <LocationMap point={point} />
          ) : (
            <Text color='$textSecondary' accessibilityLiveRegion='polite'>
              {error ? 'Vista previa no disponible' : 'Obteniendo ubicación…'}
            </Text>
          )}
          {error && (
            <YStack gap='$2'>
              <Text accessibilityRole='alert' color='$textPrimary'>
                {error}
              </Text>
              {!point && (
                <Button size='$3' onPress={locate}>
                  Reintentar
                </Button>
              )}
            </YStack>
          )}
          <XStack gap='$2' flexWrap='wrap'>
            <Button
              size='$3'
              accessibilityRole='radio'
              accessibilityState={{ checked: mode === 'current' }}
              theme={mode === 'current' ? 'accent' : undefined}
              onPress={() => setMode('current')}
            >
              Ubicación actual
            </Button>
            <Button
              size='$3'
              accessibilityRole='radio'
              accessibilityState={{ checked: mode === 'live' }}
              theme={mode === 'live' ? 'accent' : undefined}
              onPress={() => setMode('live')}
            >
              En tiempo real
            </Button>
          </XStack>
          {mode === 'live' && (
            <YStack gap='$2'>
              <Text color='$textPrimary'>Compartir durante</Text>
              <XStack gap='$2' flexWrap='wrap'>
                {LOCATION_DURATIONS.map(({ minutes, label }) => (
                  <Button
                    key={minutes}
                    size='$2'
                    accessibilityRole='radio'
                    accessibilityState={{ checked: duration === minutes }}
                    theme={duration === minutes ? 'accent' : undefined}
                    onPress={() => setDuration(minutes)}
                  >
                    {label}
                  </Button>
                ))}
              </XStack>
              <Text fontSize='$2' color='$textSecondary'>
                Mantén la aplicación abierta para actualizar la posición.
              </Text>
            </YStack>
          )}
          <XStack justify='flex-end' gap='$2'>
            <Button size='$3' onPress={onClose}>
              Cancelar
            </Button>
            <Button
              size='$3'
              theme='accent'
              disabled={!point || !mode}
              opacity={!point || !mode ? 0.5 : 1}
              onPress={submit}
            >
              Enviar
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </Modal>
  );
}
