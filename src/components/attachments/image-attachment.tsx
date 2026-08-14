import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { Download, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from 'tamagui';

type ImageAttachmentProps = {
  url: string;
  fileName: string;
};

export function ImageAttachment({ url, fileName }: ImageAttachmentProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) {
      return;
    }

    try {
      setDownloading(true);

      const file = new File(Paths.cache, fileName);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to download image');
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      file.write(new Uint8Array(arrayBuffer));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      }
    } catch (error) {
      console.error('Failed to download image:', error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {/* Image preview inside the message */}
      <Pressable onPress={() => setPreviewOpen(true)} style={styles.thumbnailContainer}>
        <Image
          source={{ uri: url }}
          contentFit='cover'
          transition={150}
          style={styles.thumbnail}
          accessibilityLabel={fileName}
        />
      </Pressable>

      {/* Full-screen image preview */}
      <Modal
        visible={previewOpen}
        transparent
        animationType='fade'
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.header}>
            <Pressable onPress={() => setPreviewOpen(false)} style={styles.headerButton}>
              <X size={24} color='white' />
            </Pressable>

            <Button
              circular
              size='$4'
              unstyled
              items='center'
              justify='center'
              bg='rgba(255,255,255,0.12)'
              pressStyle={{
                bg: 'rgba(255,255,255,0.2)',
              }}
              onPress={handleDownload}
              disabled={downloading}
              accessibilityLabel='Descargar imagen'
            >
              {downloading ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                <Download size={22} color='white' />
              )}
            </Button>
          </View>

          <Pressable style={styles.imageContainer} onPress={() => setPreviewOpen(false)}>
            <Image
              source={{ uri: url }}
              contentFit='contain'
              transition={150}
              style={styles.fullImage}
              accessibilityLabel={fileName}
            />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnailContainer: {
    width: 240,
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
  },

  thumbnail: {
    width: '100%',
    height: '100%',
  },

  modal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
  },

  header: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fullImage: {
    width: '100%',
    height: '100%',
  },
});
