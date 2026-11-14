const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/** Remove the old CallKeep services. The local call module declares its own service and activities. */
module.exports = function withAndroidCalls(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (item) => item.$['android:name'] !== 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
    );
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.service = (application.service ?? []).filter(
      (item) => !item.$['android:name'].startsWith('io.wazo.callkeep.'),
    );
    return config;
  });
};
