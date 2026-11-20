import type { LocationPoint } from '../types/location';

export function locationMapHtml(point: LocationPoint) {
  const center = JSON.stringify([point.latitude, point.longitude]);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#e8edf0;}
#fallback{position:absolute;inset:0;display:grid;place-content:center;font:14px system-ui;color:#394456;pointer-events:none}
#fallback[hidden]{display:none}
.leaflet-control-attribution{font-size:10px}
</style>
</head>
<body>
<div id="map"></div><div id="fallback">Vista del mapa</div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script>
  if (typeof L !== 'undefined') {
    const options = {
      zoomControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false
    };
    const map = L.map('map', options).setView(${center}, 16);
    map.attributionControl.setPrefix(false);
    const fallback = document.getElementById('fallback');
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    tiles.on('tileload', () => { fallback.hidden = true; });
    tiles.on('tileerror', () => { fallback.textContent = 'Mapa no disponible'; });
    tiles.addTo(map);
    const marker = L.circleMarker(${center}, {
      radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false
    }).addTo(map);
    window.setLocation = (lat, lon) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      marker.setLatLng([lat, lon]);
      if (!map.getBounds().pad(-0.25).contains([lat, lon])) map.panTo([lat, lon], { animate: false });
    };
    window.addEventListener('message', ({ data }) => {
      if (data?.type === 'location') window.setLocation(data.latitude, data.longitude);
    });
  } else {
    document.getElementById('fallback').textContent = 'Mapa no disponible';
  }
</script>
</body>
</html>`;
}
