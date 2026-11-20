import { ExternalLink, MapPin } from 'lucide-react-native';
import { Alert, Linking, Pressable } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import { useLocationStatus } from '../hooks/use-location-status';
import { googleMapsUrl } from '../types/location';
import type { LocationState } from '../types/location';
import { LocationMap } from './location-map';

export function LocationContent({
  location,
  onStop,
  pending,
  visible,
}: {
  location: LocationState;
  onStop?: () => void;
  pending: boolean;
  visible: boolean;
}) {
  const { live, label } = useLocationStatus(location);

  function open() {
    void Linking.openURL(googleMapsUrl(location)).catch(() =>
      Alert.alert('No se pudo abrir Google Maps.'),
    );
  }

  return (
    <YStack gap='$1.5' width={240} maxW='100%'>
      <Pressable
        accessibilityRole='link'
        accessibilityLabel={label + '. Abrir en Google Maps'}
        onPress={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        {visible ? (
          <LocationMap point={location} />
        ) : (
          <YStack height={142} rounded='$3' bg='$bgApp' justify='center' items='center'>
            <MapPin color='#2563eb' size={21} aria-hidden={true} />
          </YStack>
        )}
        <XStack items='center' justify='space-between' py='$1.5' gap='$2'>
          <Text fontSize='$3' color='$accent' fontWeight='600'>
            {label}
          </Text>
          <ExternalLink color='#2563eb' size={15} aria-hidden={true} />
        </XStack>
      </Pressable>
      {location.expiresAt && !pending && (
        <Text fontSize='$1' color='$textSecondary'>
          Última posición ·{' '}
          {new Date(location.capturedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
      {live && onStop && (
        <Button
          size='$2'
          variant='outlined'
          onPress={(event) => {
            event.stopPropagation();
            onStop();
          }}
        >
          {pending ? 'Cancelar envío' : 'Dejar de compartir'}
        </Button>
      )}
    </YStack>
  );
}
