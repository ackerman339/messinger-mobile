import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Text, YStack } from 'tamagui';

import { useAttachmentContext } from '@/src/contexts/attachment-context';

type ImageAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function ImageAttachment({ attachmentId, fileName }: ImageAttachmentProps) {
  const { getDownloadUrl, getLocalUri } = useAttachmentContext();

  const localUri = getLocalUri(attachmentId, fileName);

  const [previewUri, setPreviewUri] = useState<string | null>(localUri ?? null);

  const [viewerVisible, setViewerVisible] = useState(false);

  const { width, height } = useWindowDimensions();

  /**
   * Synchronize the preview with the
   * locally downloaded file.
   */
  useEffect(() => {
    if (!localUri) {
      return;
    }

    setPreviewUri(localUri);
  }, [localUri]);

  /**
   * Load the remote URL used for the
   * image preview when no local file exists.
   */
  useEffect(() => {
    if (localUri) {
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      try {
        const url = await getDownloadUrl(attachmentId);

        if (cancelled) {
          return;
        }

        setPreviewUri(url);
      } catch (error) {
        console.error('[ImageAttachment] Failed to load preview URL', error);
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, localUri, getDownloadUrl]);

  const handleOpenViewer = () => {
    setViewerVisible(true);
  };

  const handleCloseViewer = () => {
    setViewerVisible(false);
  };

  if (!previewUri) {
    return (
      <YStack width={240} height={180} items='center' justify='center'>
        <ActivityIndicator />
      </YStack>
    );
  }

  return (
    <>
      <YStack width={240} gap='$2'>
        <Pressable onPress={handleOpenViewer}>
          <Image
            source={{
              uri: previewUri,
            }}
            style={{
              width: 240,
              height: 180,
              borderRadius: 8,
            }}
            resizeMode='cover'
          />
        </Pressable>
      </YStack>

      <Modal
        visible={viewerVisible}
        transparent
        animationType='fade'
        onRequestClose={handleCloseViewer}
      >
        <YStack flex={1} bg='black' items='center' justify='center'>
          <Pressable
            onPress={handleCloseViewer}
            style={{
              position: 'absolute',
              top: 50,
              right: 20,
              zIndex: 10,
            }}
          >
            <X size={28} color='white' />
          </Pressable>

          <Image
            source={{
              uri: previewUri,
            }}
            style={{
              width,
              height: height * 0.8,
            }}
            resizeMode='contain'
          />

          <Text position='absolute' color='white' numberOfLines={1} maxW='80%'>
            {fileName}
          </Text>
        </YStack>
      </Modal>
    </>
  );
}
