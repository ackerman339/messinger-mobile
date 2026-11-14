# Llamadas de Android — servicio nativo

La señalización y WebRTC conservan el protocolo existente del backend. La presentación y el timbre pertenecen a un servicio Android propio; no se registra una cuenta de CallKeep ni se rechaza una llamada como respuesta a un fallo de presentación.

## Comportamiento de entrada

| Estado al recibir la llamada             | Presentación                        | Audio           |
| ---------------------------------------- | ----------------------------------- | --------------- |
| App cerrada, pantalla apagada            | Panel nativo sobre el bloqueo       | Timbre en bucle |
| App en segundo plano, pantalla apagada   | Panel nativo sobre el bloqueo       | Timbre en bucle |
| App cerrada, pantalla encendida          | Notificación con Aceptar y Rechazar | Timbre en bucle |
| App en segundo plano, pantalla encendida | Notificación con Aceptar y Rechazar | Timbre en bucle |
| App abierta y visible                    | Panel React de la conversación      | Timbre en bucle |

La selección se hace con PowerManager.isInteractive, sin depender del estado inicial de React. La pantalla completa necesita el permiso de Android correspondiente; a partir de Android 14 se comprueba y se ofrece abrir sus ajustes. Sin ese permiso, Android conserva la notificación como alternativa.

El servicio recibe una push válida después de comprobar sesión y vencimiento. Inicia la presentación antes del handshake del WebSocket y después solicita CALL_SYNC: un estado terminado del servidor retira la llamada. Una llamada vencida no se vuelve a presentar.

El backend debe enviar el push de cada llamada nueva aunque el destinatario tenga conexiones WebSocket. Una conexión puede pertenecer a otro equipo o seguir registrada mientras Android suspende el móvil. Ambos transportes usan el mismo callId para deduplicar la presentación.

La consulta inicial usa el expiresAt del backend o un respaldo de 60 segundos si falta. Al aceptar/rechazar, el margen para consultar el estado es de 60 segundos en lugar de 15; el vencimiento real de la llamada sigue comprobándose por separado. La restauración inicial del usuario conserva el trabajo iniciado por la tarea push.

El cierre desde recientes está cubierto por la tarea push y el servicio nativo. El cierre forzado desde los ajustes de Android bloquea la recepción de FCM hasta abrir otra vez la app. También siguen aplicándose las restricciones de entrega y batería del sistema.

## Responsabilidades

| Archivo                             | Responsabilidad                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| CallService.kt                      | Estado nativo, foreground service, CPU, vencimiento, aceptación y cierre                        |
| CallTonePlayer.kt                   | Un reproductor nativo en bucle; uso de timbre para entrada y señalización para salida           |
| CallIncomingNotification.kt         | Construcción de avisos y PendingIntents de respuesta compatibles con Expo                       |
| CallIncomingActivity.kt             | Panel nativo cuando llega una llamada con la pantalla apagada                                   |
| CallActionActivity.kt               | Detener el timbre inmediatamente y reenviar Aceptar/Rechazar al mecanismo de respuestas de Expo |
| CallAudioRoutes.kt                  | Foco de comunicación, altavoz/auricular, rutas externas y proximidad                            |
| CallWindowState.kt                  | Mantener únicamente el panel React sobre el bloqueo, hasta que el usuario lo cierre             |
| src/services/call-runtime.ts        | Una sesión de señalización por runtime JS; respuestas explícitas del usuario                    |
| src/services/native-call-service.ts | Adaptación del estado de la llamada al módulo nativo                                            |
| src/tasks/call-notifications.ts     | Recepción push, rechazo en segundo plano y respuestas de avisos                                 |
| src/providers/call-provider.tsx     | Integración con usuario autenticado, estado React y acciones de UI                              |

Los archivos Kotlin están en modules/call-audio/android/src/main/java/expo/modules/callaudio. La pantalla React y sus controles siguen en src/calls/componentes. Los providers, contextos y hooks conservan sus carpetas existentes.

## Aceptar, rechazar y finalizar

- Un toque en Aceptar o en el cuerpo del aviso detiene el timbre inmediatamente y abre la app.
- El runtime visible consulta un estado fresco, pide los permisos que falten y prepara el servicio de micrófono antes de enviar CALL_ACCEPT.
- Rechazar detiene la presentación y se entrega a la tarea de Expo; ésta usa el mismo WebSocket y CALL_SYNC antes de CALL_REJECT.
- La tarea headless no acepta llamadas destinadas a abrir la app: la respuesta permanece disponible para el listener/getLastNotificationResponseAsync del runtime visible.
- El servicio distingue el propietario de los medios. La tarea headless que pierde la selección de conexión no puede cerrar el audio que ya pertenece al runtime visible.
- CALL_END, CALL_REJECT y un CALL_STATE terminal son cierres globales y sí detienen el servicio aunque el store local de otro runtime ya esté cerrado.
- Silenciar y actualizar el nombre del contacto no reinician el reproductor ni aceptan/rechazan la llamada.
- Colgar cierra el servicio y la captura. La Activity principal no se finaliza; su panel conserva la visibilidad hasta que el usuario lo descarte.

## Micrófono, cámara y rutas

El servicio usa foregroundServiceType phoneCall al recibir una llamada. El tipo microphone se añade después de la aceptación y del permiso, mientras la actividad está visible. En las llamadas salientes se prepara el servicio durante el toque inicial del usuario para conservar la elegibilidad del micrófono al pasar a segundo plano.

Un wake lock del servicio mantiene CPU y señalización durante la llamada; el reproductor también protege la reproducción. El audio continúa con la pantalla apagada. El video mantiene la pantalla encendida mediante el hook existente y pausa su pista al pasar a segundo plano. Se conservan el cambio de cámara, el icono de cámara apagada y el botón altavoz/auricular cuando Android expone ambas salidas. Una ruta externa disponible tiene prioridad inicial.

## Instalación y OTA

Esta reescritura añade APIs y componentes nativos. Su runtime y la versión visible de la app son 1.1.0. Es necesario instalar un APK nuevo:

```sh
npx eas-cli@latest build --platform android --profile preview
```

Los siguientes cambios exclusivamente JavaScript se publican para ese mismo runtime y canal:

```sh
npx eas-cli@latest update --platform android --channel preview --environment preview --message "Ajustes de llamadas"
```

Los APK de runtimes anteriores no reciben este flujo mediante OTA. No se publica automáticamente ninguna compilación ni actualización desde las comprobaciones locales.

## Verificación

Se mantienen las comprobaciones Node existentes y se adaptan sus límites nativos a la nueva integración. Los tres casos nativos existentes cubren avisos/panel según pantalla, audio/video, actualizaciones sin reiniciar el timbre, rechazo de entregas vencidas y vencimiento sin temporizador JavaScript; se ejecutan para Android API 28 y 33. También se comprueban TypeScript, ESLint, exportación Android y merge del manifest.

Estas comprobaciones usan límites simulados y no certifican el comportamiento físico del teléfono. Antes de distribuir, quedan por ejecutar en un dispositivo los cuatro estados de la tabla, tanto para voz como para video; aceptar, rechazar, colgar desde ambos extremos y una llamada con pantalla bloqueada después de reiniciar la app.
