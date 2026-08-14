import { useVideoPlayer, VideoView } from 'expo-video';

type VideoAttachmentProps = {
  url: string;
};

export function VideoAttachment({ url }: VideoAttachmentProps) {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={{
        width: 240,
        height: 180,
        borderRadius: 8,
      }}
      nativeControls
      contentFit='contain'
    />
  );
}
