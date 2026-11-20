import * as Location from 'expo-location';
import type { LocationPoint } from '../types/location';

function toPoint(position: Location.LocationObject): LocationPoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    capturedAt: Math.round(position.timestamp),
  };
}

export async function getDeviceLocation(): Promise<LocationPoint> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error('Permite el acceso a la ubicación en los ajustes de la app.');
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Activa la ubicación del dispositivo e inténtalo de nuevo.');
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('No se pudo obtener la ubicación a tiempo.')),
          15_000,
        );
      }),
    ]);
    return toPoint(position);
  } finally {
    clearTimeout(timeout);
  }
}

export function watchDeviceLocation(onPoint: (point: LocationPoint) => void) {
  let cancelled = false;
  let subscription: Location.LocationSubscription | undefined;

  void Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 15 },
    (position) => {
      if (!cancelled) onPoint(toPoint(position));
    },
  )
    .then((watch) => {
      if (cancelled) watch.remove();
      else subscription = watch;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    subscription?.remove();
  };
}
