# Llamadas de Android

La implementación usa Expo SDK 54, React Native WebRTC y la integración de Android Telecom de `react-native-callkeep`. Solo Android está habilitado en este incremento. Se conserva el protocolo y el backend actuales, incluida la suscripción push Expo. `AuthPage` inicia el registro justo después del sign-in y `UserProvider` lo recupera para sesiones existentes.

## Qué incluye

- Botones de llamada y videollamada en el encabezado de conversaciones privadas.
- Llamadas entrantes/salientes, aceptar, rechazar, cancelar, finalizar y estados sincronizados con el servidor.
- Pantalla React Native con los colores de la aplicación y utilidades NativeWind; componentes visuales separados de hooks, contexto, provider y servicios.
- Captura de audio/video mediante WebRTC nativo, credenciales del endpoint existente `/turn/credentials`, oferta/respuesta, ICE, hashes y confirmaciones/reintentos de SDP.
- Un solo peer en la conexión seleccionada. Las señales antiguas y los resultados de permisos/captura posteriores al cierre no reactivan una llamada.
- Micrófono, encendido/apagado de cámara y cambio frontal/trasera sin crear otra llamada ni negociar por cada control. La cámara apagada muestra únicamente un icono. La captura de video se pausa al pasar a segundo plano y se restaura respetando su estado apagado y las llamadas en espera.
- Telecom en modo autogestionado (`selfManaged: true`): el servicio comienza como `phoneCall` al repicar y añade `microphone` después de conceder permiso, antes de capturar audio. Un wake lock de CPU mantiene el procesamiento de medios y señalización con la pantalla apagada. La llamada conserva Aceptar/Rechazar y la pantalla completa al estar bloqueada, cuando Android lo permite.
- Audio de voz por auricular y video por altavoz inicialmente. No se reemplaza una selección Bluetooth/audífonos existente. El botón para alternar altavoz/auricular aparece únicamente si Android detecta físicamente ambas salidas. Se conserva una ruta Bluetooth/audífonos seleccionada por Android; los controles propios alternan entre auricular y altavoz cuando ambos existen.
- Proximidad solo para voz por auricular. En video, `use-call-screen-awake.ts` evita el apagado automático de la pantalla; libera la protección al finalizar o salir a segundo plano. Apagar manualmente la pantalla pausa el video y conserva el audio.
- El timbre entrante usa el WAV en el canal nativo `messinger-incoming-calls-v3`, con `FLAG_INSISTENT`: Android repite el sonido hasta atender/rechazar, cancelar, silenciar o vencer. El volumen depende del timbre del teléfono y respeta silencio/No molestar. El repique saliente conserva su reproductor nativo independiente de React y el volumen 0.3 del cliente web.
- Antes de tomar el micrófono para una llamada se detiene una grabación de nota de voz en curso, evitando que Expo Audio y WebRTC compitan por su sesión.

## Organización

| Pieza | Responsabilidad |
| --- | --- |
| `src/calls/componentes` | Pantalla, controles, botones de chat y RTCView; sin señalización dentro de la UI |
| `src/contexts/call-context.tsx`, `src/providers/call-provider.tsx` | Acciones/estado para React y coordinación con el usuario autenticado |
| `src/hooks/use-call-panel.ts` | Modelo de presentación, nombre y duración |
| `src/hooks/use-call-screen-awake.ts` | Pantalla encendida durante video, con liberación segura aun si termina mientras se activa |
| `src/services/native-call-media.ts`, `native-incoming-call.ts` | Puentes al servicio de micrófono y al aviso nativo entrante |
| `src/services/call-sound-service.ts`, `native-call-tone.ts`, `call-ringtone.ts` | Estados de timbre/repique y puente al reproductor Android; fallback de Expo Audio para binarios antiguos de desarrollo |
| `src/clients/call-client.ts` | Composición funcional de estado, ciclo de vida, eventos y negociación |
| `src/state`, `src/events`, `src/signaling` | Sesión, eventos del protocolo, deduplicación, hashes y reintentos |
| `src/rtc/peer-session.ts` | Permisos, captura, peer, tracks y liberación de recursos nativos |
| `src/services/native-call-service.ts` | Adaptador autogestionado de Telecom, evento `showIncomingCallUi`, rutas de audio y proximidad |
| `src/services/call-notification-service.ts` | Notificación de llamada con acciones; deduplicación, vencimiento y cierre seguro ante trabajo asíncrono pendiente |
| `src/services/notification-channels.ts`, `notification-presentation.ts`, `notification-state.ts` | Canales/categoría, política de presentación y contexto/deduplicación de avisos |
| `src/hooks/use-message-notifications.ts`, `src/services/message-notification-service.ts` | Avisos de mensajes privados por WebSocket y apertura del chat desde push/local, incluso fuera de la primera página |
| `src/services/call-runtime.ts` | Una sesión compartida por React, notificaciones en segundo plano y acciones nativas; protección frente a logout y acciones tardías |
| `src/services/call-push.ts` | Validación y lectura de los distintos sobres de Expo/FCM; descarte de avisos expirados |
| `src/tasks/call-notifications.ts`, `index.js` | Tarea de notificaciones y eventos de Telecom registrados antes de cargar Expo Router |
| `src/services/call-audio-ownership.ts` | Entrega del micrófono desde el grabador de notas de voz a las llamadas |
| `modules/call-audio` | Salidas internas, proximidad y reproductor nativo de tonos con recursos WAV, vencimiento y eventos de Telecom; no cambia rutas de conversación |
| `plugins/with-android-calls.js` | Configuración reproducible del servicio de Telecom, permisos y recurso de notificación en cada prebuild |

Las funciones propias de JavaScript/TypeScript no usan clases. La única clase propia es la definición que exige el módulo nativo Kotlin de Expo. El WebSocket conserva su transporte: solo se amplían sus tipos/eventos. El mismo `requestId` se reintenta si la primera iniciación precede a la autenticación del socket, sin crear llamadas duplicadas.

## Instalación y ejecución

Las llamadas necesitan una compilación Android con WebRTC, CallKeep y el módulo local. No funcionan en Expo Go. Este incremento necesita un APK nuevo con `runtimeVersion: 1.0.2`, `FOREGROUND_SERVICE_MICROPHONE` y `USE_FULL_SCREEN_INTENT`. `expo-notifications` se compila desde código fuente en Android para reutilizar sus constructores nativos y sus acciones sin reemplazar la suscripción push ni el protocolo del backend.

1. Instalar dependencias con la versión de pnpm del proyecto.
2. Mantener las variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_PREFIX`, `EXPO_PUBLIC_API_VERSION` y `EXPO_PUBLIC_WEB_SOCKET_URL` existentes. La configuración Firebase ya utiliza `google-services.json`.
3. Generar Android: `pnpm exec expo prebuild --platform android`.
4. Compilar localmente con JDK 17/Android SDK y `pnpm android`, o usar la compilación de desarrollo de EAS ya configurada: `eas build --platform android --profile development`.
5. Instalar la app, iniciar sesión y conceder notificaciones, micrófono/cámara y Bluetooth cuando proceda. Android 8 o posterior permite registrar la cuenta autogestionada sin pedir habilitarla manualmente en ajustes.

Los directorios `android`/`ios` continúan generándose y permanecen ignorados en git. El módulo local y el plugin están versionados para no depender de cambios manuales en los archivos generados. Los plugins de WebRTC 13 y CallKeep 12 corresponden a Expo SDK 54.

## Entrada por notificaciones

El servicio `push-registration.ts` comparte el registro entre el sign-in y `UserProvider`: obtiene primero el token nativo (FCM en Android), después el token Expo, y lo envía al endpoint autenticado `/push/subscribe-mobile`. Navegar desde autenticación a chat no cancela ese registro ni duplica el POST. La obtención del token solo prepara el canal básico que Android necesita para pedir permiso; la categoría y tarea de llamadas se inicializan de forma independiente. Hay reintentos acotados mientras la app está visible y al regresar a primer plano, y logout espera una suscripción en vuelo antes de retirarla. Los logs `[push] registration-failed` indican la etapa (`message-channel`, `permission`, `native-token`, `expo-token` o `backend`), código y estado HTTP sin imprimir tokens ni headers.

El registro conserva el servicio existente; los cambios no añaden otro registro ni modifican el backend. La tarea Android está registrada con `expo-notifications`/`expo-task-manager` y lee tanto `content.data` como `data.body`/`dataString` de los mensajes FCM de Expo. Los mensajes privados reutilizan la misma suscripción. No se implementan avisos de mensajes grupales ni se modifica el backend.

Una push `call-incoming` válida restaura la conexión autenticada, solicita `CALL_SYNC` y registra la llamada en Telecom autogestionado y presenta la notificación propia cuando se recibe `showIncomingCallUi`. La categoría `messingerIncomingCall` tiene Aceptar (abre la app) y Rechazar (acción en segundo plano mediante la tarea registrada). Un aviso expirado se descarta. La push no se considera autoridad sobre participante, medio o estado: antes de `CALL_ACCEPT`/`CALL_REJECT` se valida el snapshot del servidor. Las acciones nativas en un arranque frío se entregan a la misma sesión; colgar durante una aceptación pendiente impide una aceptación tardía. El clic en una notificación entrante solicita aceptar; una llamada perdida no acepta ni rechaza nada.

El transporte existente debe entregar el evento con `data.type = call-incoming`, `callId` y los campos opcionales `callerId`, `media`, `expiresAt`. La entrega en segundo plano depende del formato que Expo/FCM entrega y de las restricciones de Android. La app debe haber abierto y registrado la tarea al menos una vez. Un cierre forzado desde ajustes impide recibir push hasta volver a abrirla; no se garantiza saltar las restricciones de batería de cada fabricante.

El backend termina una llamada si pierde el WebSocket seleccionado. La app evita desconectarlo intencionalmente al ir a segundo plano durante una llamada, pero no promete transferir una llamada a un socket nuevo ni mantenerla tras un cierre del proceso o pérdida definitiva de la conexión.

## Validación

- `pnpm typecheck`: incluye la app real y excluye la copia antigua `app-example` que ya estaba ignorada por git.
- `pnpm test:calls`: pruebas de presentación/acciones de avisos de llamadas, cierre/vencimiento/logout durante trabajo pendiente, inicialización autogestionada, deduplicación y navegación de mensajes privados. Los SDK de plataforma se simulan en Node.
- `pnpm lint`: revisión estática del proyecto.
- `pnpm exec expo export --platform android`: validación del bundle Hermes/Metro y de los assets.
- `expo prebuild --platform android --no-install`: validación de los plugins y del manifest generado.
- `./gradlew :messinger-call-audio:compileReleaseKotlin` desde `android`: compilación real del módulo local y sus recursos contra las dependencias de Expo.

La revisión ejecutó 94 pruebas Node, tres pruebas nativas, TypeScript, lint, Expo Doctor (18/18) y el bundle Android. Además, se prepararon JDK 17 y Android SDK 36 en una carpeta temporal y se compiló correctamente `:messinger-call-audio:compileReleaseKotlin`. Esto verifica el Kotlin real, incluido el retorno explícito de `Unit` en la función asíncrona sin argumentos; no equivale a compilar el APK completo ni a probarlo en un teléfono. Permanecen advertencias de APIs obsoletas de las dependencias.

Las pruebas de regresión reproducen cierres/mensajes tardíos del WebSocket después de una reconexión, renovación de sesión sin enviar al socket cerrado y lectura tardía del token. Los avisos de llamadas permiten reintentar tras conceder permisos o restaurar la sesión; el fallo de una presentación antigua no descarta una actualización que sigue en cola.

### Prueba mínima en teléfonos

1. Llamada de voz y de video entre dos usuarios, incluyendo móvil ↔ web y una red que requiera TURN.
2. Aceptar/rechazar/cancelar con app abierta, en segundo plano y con pantalla bloqueada; comprobar que una notificación vieja no reabre una llamada.
3. Micrófono, cámara apagada, cambio frontal/trasera y colgado mientras se solicita un permiso.
4. Auricular/altavoz, conectar/desconectar Bluetooth y proximidad en ambas rutas.
5. Volver a segundo plano durante audio/video: audio continúa mientras se conserva la conexión; el video se pausa.
6. Llamada de telefonía durante la llamada de Messinger: espera/mute/fin del sistema no dejan el micrófono transmitiendo sin indicación.
7. Logout durante una llamada o una solicitud de permisos: se cierran medios, interfaz nativa y suscripción push.

La prueba de estas condiciones en dispositivos físicos está pendiente. iOS/PushKit/CallKit y el historial de llamadas dentro de la app quedan fuera de este incremento de Android.

## Notificaciones de mensajes privados

Los mensajes recibidos por `NEW_MESSAGE` generan un aviso local si pertenecen a otra conversación o la app no está visible. Los mensajes propios y los mensajes de grupos se excluyen. Para adjuntos sin texto se muestra una descripción breve. El chat abierto en primer plano no genera otro aviso; si la pantalla de llamada lo cubre, sí se notifica.

Las push remotas que ya envía el backend se presentan por el transporte nativo de Expo. Un registro por `messageId` y la revisión de avisos ya presentados evitan duplicar la entrega local/remota. Al tocar un mensaje se abre su conversación; si no está en las páginas cargadas, se consulta la lista autenticada hasta encontrarla. Un cambio de usuario cancela resultados tardíos. Abrir un chat retira sus avisos sin retirar llamadas ni mensajes de otras conversaciones.

### Distribución de este incremento

Generar un APK nuevo: `npx eas-cli@latest build --platform android --profile preview`. Instalarlo y abrirlo una vez. Las OTA posteriores deben conservar el canal `preview`, el entorno `preview` y el runtime `1.0.2` de ese APK. Una OTA sobre `1.0.1` no incorpora estos cambios nativos. No se publica una OTA ni se inicia una build de EAS desde este cambio.

Probar en Android físico: aceptar/rechazar y tocar el cuerpo del aviso con app abierta, en segundo plano y arrancando en frío; cancelación desde el llamante; permisos de notificación revocados; mensajes privados con app cerrada y el chat abierto. La intención de pantalla completa abre el panel sobre el bloqueo sin aceptar automáticamente. Android decide entre pantalla completa y aviso emergente según bloqueo, uso del teléfono y permisos. Si Android 14+ deniega pantalla completa, se explica una vez cómo concederla; el aviso y timbre siguen disponibles.

## Repetición de tonos

`call-runtime.ts` sincroniza el sonido antes de la integración de Telecom y lo detiene inmediatamente al aceptar/rechazar. Ya no hay un hook de UI que corte el audio en cada cambio de AppState. El mismo estado activa el tono entrante mientras `ringing`, y el saliente mientras `requesting`/`ringing`, igual que en web.

`CallIncomingNotification.kt` reutiliza `ExpoNotificationBuilder` para conservar los intents y payloads de Aceptar/Rechazar y clic en el cuerpo. Añade la intención de pantalla completa antes de publicar, sonido y `FLAG_INSISTENT`; el receptor de Telecom puede publicarla incluso después de terminar la tarea headless, usando los datos entregados antes de registrar la llamada. No necesita que React continúe montado ni que JavaScript pida foco de audio. `CallWindowState.kt` permite mostrar únicamente el panel de llamada sobre el bloqueo y retira ese permiso al terminar. `CallTonePlayer.kt` conserva solo el repique saliente y escucha los eventos de Telecom para detener recursos y silenciar avisos.

El vencimiento se programa en Android y se comprueba antes de reproducir, sin depender del intervalo JS. Al aceptar, WebRTC espera que el hilo principal nativo libere el reproductor y el foco de audio antes de capturar medios. Cada llamada tiene una clave propia: los refrescos y la llegada tardía del UUID saliente no reinician el sonido, y una acción vieja no silencia otra llamada. Un binario antiguo de desarrollo conserva el fallback anterior de Expo Audio, que no garantiza timbre con app cerrada.

El nuevo canal `messinger-incoming-calls-v3` incluye el WAV de timbre; `v2` era silencioso y no puede cambiar su sonido una vez creado. El transporte remoto del backend sigue usando su canal existente; una push puede emitir su aviso inicial antes de que el cliente la sustituya por el aviso de llamada nativo.

Este cambio requiere compilar e instalar un APK con runtime `1.0.2`. La reproducción con app cerrada normalmente, pantalla bloqueada y cambios de ruta requiere validación en un teléfono físico. Forzar detención desde ajustes bloquea la entrega push hasta abrir de nuevo la app.

Se ejecutaron 94 pruebas Node y tres pruebas nativas con Robolectric. Las nativas usan el constructor real de Expo y comprueban repetición, acciones, intención de pantalla completa y descarte de llamadas vencidas o canceladas. `:messinger-call-audio:testReleaseUnitTest` también compila el Kotlin de producción. Sigue siendo necesaria la prueba física del micrófono con pantalla bloqueada y de la política de presentación de cada teléfono.

Para la comprobación: instalar el APK, iniciar sesión y cerrar desde recientes; llamar desde otro usuario con la pantalla bloqueada; comprobar repetición, rechazo, aceptación y cancelación remota. Repetir para voz/video y comprobar el repique al llamar. `adb logcat -s MessingerCallTone RNCallKeep` muestra el inicio nativo y posibles errores de preparación o foco. Los tests Node validan el puente y la coordinación; no ejecutan el reproductor de Android.

## Video remoto en Android

`peer-session.ts` publica primero la captura local y deja `remote` vacío hasta recibir un evento `track`. Para el video utiliza el `MediaStream` nativo de `event.streams`, que ya tiene sus pistas enlazadas; no reconstruye todos los streams remotos mediante `new MediaStream()` y `addTrack()`.

`CallPanel` y `CallStream` esperan una pista de video viva antes de montar `RTCView`. La clave de la vista combina la URL nativa y el ID de la pista de video, para volver a enlazar un reemplazo real sin remontar por mensajes de estado. Esto evita montar el renderer sobre un stream vacío o solo de audio y conservar después esa misma URL sin volver a buscar video. El Modal tiene aceleración por hardware para las superficies de video de Android.

Si un peer entrega una pista sin ningún stream asociado, se mantiene un fallback sintético. Su publicación espera una operación nativa posterior a `mediaStreamCreate`/`mediaStreamAddTrack`, descarta resultados tardíos y no reemplaza un stream nativo de video por otro de solo audio. PeerConnection conserva la propiedad y liberación de sus streams remotos; el cliente libera por separado su captura y el fallback que crea.

Las pruebas simulan la caché de URL de RTCView, audio antes de video en ambos roles, video antes de audio, cambio de pista con la misma URL, streamless y colgado durante operaciones pendientes. La comprobación visual en Android físico, incluyendo móvil ↔ web, queda pendiente. La corrección no cambia dependencias ni configuración nativa y puede distribuirse por OTA al APK compatible.
