import { useEffect, useRef, useState } from 'react';
import { locationMapHtml } from './location-map-html';
import type { LocationPoint } from '../types/location';

export function LocationMap({ point }: { point: LocationPoint }) {
  const map = useRef<HTMLIFrameElement>(null);
  const [html] = useState(() => locationMapHtml(point));
  const { latitude, longitude } = point;

  useEffect(() => {
    map.current?.contentWindow?.postMessage({ type: 'location', latitude, longitude }, '*');
  }, [latitude, longitude]);

  return (
    <iframe
      ref={map}
      srcDoc={html}
      title='Mapa de la ubicación'
      sandbox='allow-scripts'
      onLoad={() =>
        map.current?.contentWindow?.postMessage({ type: 'location', latitude, longitude }, '*')
      }
      style={{ width: '100%', height: 142, border: 0, borderRadius: 8, pointerEvents: 'none' }}
    />
  );
}
