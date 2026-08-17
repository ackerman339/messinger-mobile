import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Download, File as FileIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { useAttachmentContext } from '@/src/contexts/attachment-context';
import { COLORS } from '@/src/lib/constants';

type FileAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
};

export function FileAttachment({ attachmentId, fileName, contentType }: FileAttachmentProps) {
  const { getDownloadUrl, downloadAttachment, getLocalUri, getDownloadState } =
    useAttachmentContext();

  const localUri = getLocalUri(attachmentId, fileName);

  const state = getDownloadState(attachmentId);

  /**
   * Load and cache the presigned URL when
   * the component is mounted.
   *
   * This does not download the file.
   */
  useEffect(() => {
    if (localUri) {
      return;
    }

    let cancelled = false;

    async function loadDownloadUrl() {
      try {
        await getDownloadUrl(attachmentId);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('[FileAttachment] Failed to load download URL', error);
      }
    }

    loadDownloadUrl();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, localUri, getDownloadUrl]);

  /**
   * Download the file to the local filesystem.
   */
  const handleDownload = async () => {
    try {
      await downloadAttachment(attachmentId, fileName);
    } catch {
      // Error is handled by the provider.
    }
  };

  /**
   * Open the locally downloaded file
   * with a compatible native application.
   */
  const handleOpen = async () => {
    if (!localUri) {
      return;
    }

    try {
      if (Platform.OS === 'android') {
        /**
         * Android applications cannot directly
         * access another application's file:// URI.
         *
         * Convert it to a content:// URI first.
         */
        const contentUri = await FileSystemLegacy.getContentUriAsync(localUri);

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: contentType,
          flags: 1,
        });

        return;
      }

      /**
       * iOS can open local files using
       * the system registered applications.
       */
      const canOpen = await Linking.canOpenURL(localUri);

      if (!canOpen) {
        Alert.alert(
          'No se pudo abrir el archivo',
          'No hay una aplicación compatible para abrir este archivo.',
        );

        return;
      }

      await Linking.openURL(localUri);
    } catch (error) {
      console.error('[FileAttachment] Failed to open file', error);

      Alert.alert(
        'No se pudo abrir el archivo',
        'No hay una aplicación compatible para abrir este archivo.',
      );
    }
  };

  /**
   * Once the file exists locally, show the
   * openable file instead of the download button.
   */
  if (localUri) {
    return (
      <Pressable onPress={handleOpen}>
        <XStack
          width={240}
          bg='$bgApp'
          px='$3'
          py='$3'
          items='center'
          gap='$3'
          style={{
            borderRadius: 8,
          }}
        >
          <FileIcon size={30} color={COLORS.accent} />

          <YStack flex={1} minW={0}>
            <Text fontSize='$3' color='$textPrimary' numberOfLines={2}>
              {fileName}
            </Text>

            <Text fontSize='$2' color='$textSecondary'>
              Toca para abrir
            </Text>
          </YStack>
        </XStack>
      </Pressable>
    );
  }

  return (
    <YStack
      width={240}
      bg='$bgApp'
      px='$3'
      py='$3'
      gap='$2'
      style={{
        borderRadius: 8,
      }}
    >
      <XStack items='center' gap='$3'>
        <FileIcon size={30} color={COLORS.accent} />

        <Text flex={1} fontSize='$3' color='$textPrimary' numberOfLines={2}>
          {fileName}
        </Text>
      </XStack>

      <Pressable onPress={handleDownload} disabled={state.isDownloading}>
        <XStack
          bg='$accent'
          px='$3'
          py='$2'
          items='center'
          justify='center'
          gap='$2'
          style={{
            borderRadius: 8,
          }}
        >
          {state.isDownloading ? (
            <ActivityIndicator color='white' />
          ) : (
            <>
              <Download size={18} color='white' />

              <Text color='white'>Descargar</Text>
            </>
          )}
        </XStack>
      </Pressable>

      {state.error ? (
        <Text fontSize='$2' color='$red10'>
          {state.error}
        </Text>
      ) : null}
    </YStack>
  );
}
