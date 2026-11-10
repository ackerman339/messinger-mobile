# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Notificaciones push móviles

La app obtiene el token de Expo después de restaurar la sesión y lo registra con
`POST /push/subscribe-mobile` (`token` y `platform`: `ANDROID` o `IOS`). Al volver
a primer plano sincroniza el registro y reintenta los fallos de red sin volver a
pedir permisos. Antes del logout llama a `DELETE /push/unsubscribe-mobile` con
`{ token }`. El envío lo realiza el backend.

El canal Android es `messages`, igual al que usa el backend. El registro se omite
en web, simuladores y Expo Go. Al rechazar permisos, la app sigue funcionando.

### Configuración necesaria para recibir notificaciones

1. En Firebase, registrar una app Android con el paquete `com.messinger.mobile`.
2. Descargar su `google-services.json` y agregar la ruta en `expo.android.googleServicesFile`
   de `app.json`, por ejemplo `"googleServicesFile": "./google-services.json"`.
3. Configurar las credenciales FCM v1 del proyecto en EAS. El archivo de cuenta de
   servicio de Firebase se carga en EAS; no se incluye en el código de la app.
4. Para iOS, configurar las credenciales APNs del identificador `com.messinger.mobile`
   en EAS.
5. Generar un nuevo build nativo. Para probar Android puede utilizarse el perfil
   `preview` existente: `npx eas-cli build --platform android --profile preview`.
   Para una compilación local, sincronizar primero los archivos generados con
   `pnpm exec expo prebuild --platform android --no-install` y ejecutar `pnpm android`.

Usar un dispositivo físico con permisos habilitados. Para verificar el flujo,
autenticar, enviar la app a segundo plano y generar un mensaje desde otra cuenta.
Las reglas del backend envían push solo cuando el destinatario no tiene conexiones
WebSocket; cerrar también sus otras sesiones web para esta prueba.

La integración registra y elimina el token y permite presentar notificaciones;
no incluye navegación a una conversación específica al tocar una notificación.

Referencia: [Configuración de Expo Push](https://docs.expo.dev/push-notifications/push-notifications-setup/).
