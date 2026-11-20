import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { locationMapHtml } from './location-map-html';
import type { LocationPoint } from '../types/location';

export function LocationMap({ point }: { point: LocationPoint }) {
  const map = useRef<WebView>(null);
  const [source] = useState(() => ({ html: locationMapHtml(point) }));
  const { latitude, longitude } = point;

  function updateMarker() {
    map.current?.injectJavaScript(`window.setLocation?.(${latitude}, ${longitude}); true;`);
  }

  useEffect(() => {
    map.current?.injectJavaScript(`window.setLocation?.(${latitude}, ${longitude}); true;`);
  }, [latitude, longitude]);

  return (
    <View pointerEvents='none' style={{ height: 142, overflow: 'hidden', borderRadius: 8 }}>
      <WebView
        ref={map}
        source={source}
        onLoadEnd={updateMarker}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={({ url, isTopFrame }) =>
          !isTopFrame || url === 'about:blank' || url.startsWith('data:text/html')
        }
        applicationNameForUserAgent='Messinger'
        scrollEnabled={false}
        bounces={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        accessibilityLabel='Mapa de la ubicación'
      />
    </View>
  );
}
