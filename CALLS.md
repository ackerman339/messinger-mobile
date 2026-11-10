# Llamadas de Android

La implementación usa Expo SDK 54, React Native WebRTC y la integración de Android Telecom de `react-native-callkeep`. Solo Android está habilitado en este incremento. Se conserva el protocolo y el backend actuales, incluida la suscripción push Expo que ya registra `UserProvider`.

## Qué incluye

- Botones de llamada y videollamada en el encabezado de conversaciones privadas.
- Llamadas entrantes/salientes, aceptar, rechazar, cancelar, finalizar y estados sincronizados con el servidor.
- Pantalla React Native con los colores de la aplicación y utilidades NativeWind; componentes visuales separados de hooks, contexto, provider y servicios.
- Captura de audio/video mediante WebRTC nativo, credenciales del endpoint existente `/turn/credentials`, oferta/respuesta, ICE, hashes y confirmaciones/reintentos de SDP.
- Un solo peer en la conexión seleccionada. Las señales antiguas y los resultados de permisos/captura posteriores al cierre no reactivan una llamada.
- Micrófono, encendido/apagado de cámara y cambio frontal/trasera sin crear otra llamada ni negociar por cada control. La cámara apagada muestra únicamente un icono. La captura de video se pausa al pasar a segundo plano y se restaura respetando su estado apagado y las llamadas en espera.
- Interfaz de llamadas del sistema con aceptar, colgar, mute y espera; servicio en primer plano de tipo `phoneCall` y conservación del WebSocket mientras hay una llamada pendiente o activa.
- Audio de voz por auricular y video por altavoz inicialmente. No se reemplaza una selección Bluetooth/audífonos existente. El botón para alternar altavoz/auricular aparece únicamente si Android detecta físicamente ambas salidas. Bluetooth y audífonos también pueden gestionarse desde la interfaz de llamadas del sistema.
- Proximidad: pantalla apagada al acercar el teléfono al oído cuando se usa el auricular interno. Se libera al cambiar de salida, poner en espera o finalizar.
- Repique saliente en voz/video; el sistema reproduce el timbre entrante de la llamada nativa. El tono entrante de la app se conserva como alternativa de primer plano si todavía no hay una llamada nativa presentada; no se reproducen ambos a la vez.
- Antes de tomar el micrófono para una llamada se detiene una grabación de nota de voz en curso, evitando que Expo Audio y WebRTC compitan por su sesión.

## Organización

| Pieza | Responsabilidad |
| --- | --- |
| `src/calls/componentes` | Pantalla, controles, botones de chat y RTCView; sin señalización dentro de la UI |
| `src/contexts/call-context.tsx`, `src/providers/call-provider.tsx` | Acciones/estado para React y coordinación con el usuario autenticado |
| `src/hooks/use-call-panel.ts`, `src/hooks/use-call-sound.ts` | Modelo de presentación, nombre/duración y reproducción de tonos |
| `src/clients/call-client.ts` | Composición funcional de estado, ciclo de vida, eventos y negociación |
| `src/state`, `src/events`, `src/signaling` | Sesión, eventos del protocolo, deduplicación, hashes y reintentos |
| `src/rtc/peer-session.ts` | Permisos, captura, peer, tracks y liberación de recursos nativos |
| `src/services/native-call-service.ts` | Adaptador de Telecom, llamadas del sistema, rutas de audio y proximidad |
| `src/services/call-runtime.ts` | Una sesión compartida por React, notificaciones en segundo plano y acciones nativas; protección frente a logout y acciones tardías |
| `src/services/call-push.ts` | Validación y lectura de los distintos sobres de Expo/FCM; descarte de avisos expirados |
| `src/tasks/call-notifications.ts`, `index.js` | Tarea de notificaciones y eventos de Telecom registrados antes de cargar Expo Router |
| `src/services/call-audio-ownership.ts` | Entrega del micrófono desde el grabador de notas de voz a las llamadas |
| `modules/call-audio` | Módulo Expo Android que detecta salidas internas y controla solo la proximidad; no cambia rutas de audio |
| `plugins/with-android-calls.js` | Configuración reproducible del servicio de Telecom, permisos y recurso de notificación en cada prebuild |

Las funciones propias de JavaScript/TypeScript no usan clases. La única clase propia es la definición que exige el módulo nativo Kotlin de Expo. El WebSocket conserva su transporte: solo se amplían sus tipos/eventos. El mismo `requestId` se reintenta si la primera iniciación precede a la autenticación del socket, sin crear llamadas duplicadas.

## Instalación y ejecución

Esto añade código nativo: **es necesario generar e instalar una nueva compilación Android**. No funciona en Expo Go y una actualización solo de JavaScript no incorpora los módulos nuevos.

1. Instalar dependencias con la versión de pnpm del proyecto.
2. Mantener las variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_PREFIX`, `EXPO_PUBLIC_API_VERSION` y `EXPO_PUBLIC_WEB_SOCKET_URL` existentes. La configuración Firebase ya utiliza `google-services.json`.
3. Generar Android: `pnpm exec expo prebuild --platform android`.
4. Compilar localmente con JDK 17/Android SDK y `pnpm android`, o usar la compilación de desarrollo de EAS ya configurada: `eas build --platform android --profile development`.
5. Instalar la nueva app, iniciar sesión, conceder micrófono/notificaciones/cámara y Bluetooth cuando proceda, y habilitar la cuenta de llamadas de Messinger en el diálogo de Android. La pantalla de ajustes de la cuenta es parte de Telecom gestionado.

Los directorios `android`/`ios` continúan generándose y permanecen ignorados en git. El módulo local y el plugin están versionados para no depender de cambios manuales en los archivos generados. Los plugins de WebRTC 13 y CallKeep 12 corresponden a Expo SDK 54.

## Entrada por notificaciones

El servicio existente registra el token Expo en `/push/subscribe-mobile`; los cambios no añaden otro registro ni modifican el backend. La tarea Android está registrada con `expo-notifications`/`expo-task-manager` y lee tanto `content.data` como `data.body`/`dataString` de los mensajes FCM de Expo. Los mensajes de chat conservan su flujo.

Una push `call-incoming` válida restaura la conexión autenticada, solicita `CALL_SYNC` y presenta la llamada mediante Telecom si la cuenta ya está configurada. Un aviso expirado se descarta. La push no se considera autoridad sobre participante, medio o estado: antes de `CALL_ACCEPT`/`CALL_REJECT` se valida el snapshot del servidor. Las acciones nativas en un arranque frío se entregan a la misma sesión; colgar durante una aceptación pendiente impide una aceptación tardía. El clic en una notificación entrante solicita aceptar; una llamada perdida no acepta ni rechaza nada.

El transporte existente debe entregar el evento con `data.type = call-incoming`, `callId` y los campos opcionales `callerId`, `media`, `expiresAt`. La entrega en segundo plano depende del formato que Expo/FCM entrega y de las restricciones de Android. La app debe haber abierto y registrado la tarea al menos una vez. Un cierre forzado desde ajustes impide recibir push hasta volver a abrirla; no se garantiza saltar las restricciones de batería de cada fabricante.

El backend termina una llamada si pierde el WebSocket seleccionado. La app evita desconectarlo intencionalmente al ir a segundo plano durante una llamada, pero no promete transferir una llamada a un socket nuevo ni mantenerla tras un cierre del proceso o pérdida definitiva de la conexión.

## Validación

- `pnpm typecheck`: incluye la app real y excluye la copia antigua `app-example` que ya estaba ignorada por git.
- `pnpm test:calls`: pruebas del flujo de señalización, medios nativos simulados, carreras de permisos/colgado, sincronización, parser push y adaptador de Telecom/rutas/proximidad.
- `pnpm lint`: revisión estática del proyecto.
- `pnpm exec expo export --platform android`: validación del bundle Hermes/Metro y de los assets.
- `expo prebuild --platform android --no-install`: validación de los plugins y del manifest generado.

Las pruebas de módulos nativos son simuladas; no sustituyen una compilación y prueba en un teléfono. En el equipo usado para este cambio no hay JDK ni Android SDK, por lo que no se genera ni se instala un APK local.

### Prueba mínima en teléfonos

1. Llamada de voz y de video entre dos usuarios, incluyendo móvil ↔ web y una red que requiera TURN.
2. Aceptar/rechazar/cancelar con app abierta, en segundo plano y con pantalla bloqueada; comprobar que una notificación vieja no reabre una llamada.
3. Micrófono, cámara apagada, cambio frontal/trasera y colgado mientras se solicita un permiso.
4. Auricular/altavoz, conectar/desconectar Bluetooth y proximidad en ambas rutas.
5. Volver a segundo plano durante audio/video: audio continúa mientras se conserva la conexión; el video se pausa.
6. Llamada de telefonía durante la llamada de Messinger: espera/mute/fin del sistema no dejan el micrófono transmitiendo sin indicación.
7. Logout durante una llamada o una solicitud de permisos: se cierran medios, interfaz nativa y suscripción push.

La prueba de estas condiciones en dispositivos físicos está pendiente. iOS/PushKit/CallKit y el historial de llamadas dentro de la app quedan fuera de este incremento de Android.
