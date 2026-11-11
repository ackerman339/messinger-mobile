const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/** Complements the SDK-54 CallKeep plugin without hand-editing generated Android files. */
module.exports = function withAndroidCalls(config) {
  config.android = config.android ?? {};
  config.android.permissions = (config.android.permissions ?? []).filter(
    (name) => name !== 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
  );
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    // This is a signature permission on the ConnectionService, never an app permission.
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (item) => item.$['android:name'] !== 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
    );
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const services = application.service ?? [];
    let connection = services.find(
      (item) => item.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService',
    );
    if (!connection) {
      connection = {
        $: {
          'android:name': 'io.wazo.callkeep.VoiceConnectionService',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.telecom.ConnectionService' } }] },
        ],
      };
      services.push(connection);
    }
    connection.$['android:label'] = 'Messinger';
    // Ringing starts as phoneCall only. Microphone is added after permission, before capture.
    connection.$['android:foregroundServiceType'] = 'phoneCall|microphone';
    let background = services.find(
      (item) => item.$['android:name'] === 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService',
    );
    if (!background) {
      background = {
        $: { 'android:name': 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService' },
      };
      services.push(background);
    }
    background.$['android:exported'] = 'false';
    application.service = services;
    return config;
  });
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/mipmap');
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(
        path.join(directory, 'ic_messinger_call.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
<path android:fillColor="#FFFFFFFF" android:pathData="M6.62,10.79a15.05,15.05 0,0 0,6.59 6.59l2.2,-2.2a1,1 0,0 1,1.02 -0.24c1.12,0.37 2.33,0.57 3.57,0.57a1,1 0,0 1,1 1V20a1,1 0,0 1,-1 1C10.61,21 3,13.39 3,4a1,1 0,0 1,1 -1h3.5a1,1 0,0 1,1 1c0,1.25 0.2,2.45 0.57,3.57a1,1 0,0 1,-0.25 1.02l-2.2,2.2z"/>
</vector>`,
      );
      return config;
    },
  ]);
};
