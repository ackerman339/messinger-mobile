import { useVideoPlayer, VideoView } from 'expo-video';
import { Play } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { YStack } from 'tamagui';

import { useAttachmentContext } from '@/src/contexts/attachment-context';

type VideoAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function VideoAttachment({ attachmentId, fileName }: VideoAttachmentProps) {
  const { getDownloadUrl, getLocalUri } = useAttachmentContext();

  const localUri = getLocalUri(attachmentId, fileName);

  const [uri, setUri] = useState<string | null>(localUri ?? null);

  const videoRef = useRef<VideoView>(null);

  /**
   * Synchronize the player with the
   * locally downloaded file.
   */
  useEffect(() => {
    if (!localUri) {
      return;
    }

    setUri(localUri);
  }, [localUri]);

  /**
   * Load the remote URL used for the
   * video preview when no local file exists.
   */
  useEffect(() => {
    if (localUri) {
      return;
    }

    let cancelled = false;

    async function loadPreviewUrl() {
      try {
        const url = await getDownloadUrl(attachmentId);

        if (cancelled) {
          return;
        }

        setUri(url);
      } catch (error) {
        console.error('[VideoAttachment] Failed to load preview URL', error);
      }
    }

    loadPreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, localUri, getDownloadUrl]);

  /**
   * Open the native fullscreen video player.
   */
  const handleOpenFullscreen = async () => {
    try {
      await videoRef.current?.enterFullscreen();
    } catch (error) {
      console.error('[VideoAttachment] Failed to enter fullscreen', error);
    }
  };

  const player = useVideoPlayer(
    uri
      ? {
          uri,
          contentType: 'progressive',
        }
      : null,
    (player) => {
      player.loop = false;
    },
  );

  if (!uri) {
    return (
      <YStack
        width={240}
        height={160}
        items='center'
        justify='center'
        bg='$bgApp'
        style={{
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <ActivityIndicator />
      </YStack>
    );
  }

  return (
    <YStack width={240} gap='$2'>
      <YStack
        width={240}
        height={160}
        position='relative'
        style={{
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <VideoView
          ref={videoRef}
          player={player}
          nativeControls={false}
          contentFit='contain'
          style={{
            width: '100%',
            height: '100%',
          }}
        />

        <Pressable
          onPress={handleOpenFullscreen}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <YStack
            width={48}
            height={48}
            items='center'
            justify='center'
            bg='rgba(0, 0, 0, 0.65)'
            style={{
              borderRadius: 24,
            }}
          >
            <Play size={24} color='white' fill='white' />
          </YStack>
        </Pressable>
      </YStack>
    </YStack>
  );
}
