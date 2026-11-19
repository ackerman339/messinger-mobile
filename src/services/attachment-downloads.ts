import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

type NativeDownloads = {
  save: (uri: string, fileName: string, contentType: string) => Promise<boolean>;
};

let pendingIosSave = Promise.resolve();

export async function saveAttachmentToPhone(uri: string, fileName: string, contentType: string) {
  const downloads = requireOptionalNativeModule<NativeDownloads>('PulseDownloads');

  if (!downloads) {
    throw new Error('Esta versión de Pulse no puede guardar archivos en Descargas Pulse.');
  }

  if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    );
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Permite el acceso al almacenamiento para guardar el archivo.');
    }
  }

  // Keep attachment names valid on Android's shared storage.
  const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').trim();
  const name = safeName && safeName !== '.' && safeName !== '..' ? safeName : 'archivo';
  const mimeType = contentType.split(';', 1)[0].trim() || 'application/octet-stream';

  if (Platform.OS === 'ios') {
    // Reuse the folder selected for the first download if several are started together.
    const save = pendingIosSave.then(() => downloads.save(uri, name, mimeType));
    pendingIosSave = save.then(
      () => undefined,
      () => undefined,
    );
    return save;
  }

  return downloads.save(uri, name, mimeType);
}
