import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { AudioAttachment } from '@/src/components/attachments/audio-attachment';
import { FileAttachment } from '@/src/components/attachments/file-attachment';
import { ImageAttachment } from '@/src/components/attachments/image-attachment';
import { VideoAttachment } from '@/src/components/attachments/video-attachment';
import { useChatContext } from '@/src/contexts/chat-context';
import { useUserContext } from '@/src/contexts/user-context';
import { fileService } from '@/src/services/files';

import type { Message } from '@/src/types/conversation';

export function MessageList() {
  const { activeConversation } = useChatContext();

  const scrollRef = useRef<ScrollView>(null);

  const loading = false;
  const error = null;

  const messages: Message[] = useMemo(
    () => activeConversation?.messages ?? [],
    [activeConversation],
  );

  useEffect(() => {
    // Wait for React Native to finish rendering the messages
    // before scrolling to the bottom.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [messages.length, activeConversation?.id]);

  if (!activeConversation) {
    return <EmptyState label='Selecciona una conversación' />;
  }

  if (loading) {
    return <EmptyState label='Cargando mensajes...' />;
  }

  if (error) {
    return <EmptyState label={error} />;
  }

  if (!loading && messages.length === 0) {
    return <EmptyState label='No hay mensajes todavía' />;
  }

  return (
    <ScrollView
      ref={scrollRef}
      flex={1}
      bg='$bgApp'
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        px: 12,
        pt: 24,
        pb: 20,
        gap: 8,
      }}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </ScrollView>
  );
}

type MessageBubbleProps = {
  message: Message;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useUserContext();

  const [downloads, setDownloads] = useState<Map<string, string>>(new Map());

  const isOwn = message.senderId === user?.id;

  useEffect(() => {
    if (!message.attachments?.length) {
      return;
    }

    let cancelled = false;

    async function getDownloadUrls() {
      const downloads: { id: string; url: string }[] = [];

      for (const attachment of message.attachments) {
        try {
          const result = await fileService.downloadFile({
            attachmentId: attachment.id,
          });

          downloads.push({
            id: attachment.id,
            url: result.url,
          });
        } catch (error) {
          console.error(`Failed to get download URL for attachment ${attachment.id}`, error);
        }
      }

      if (!cancelled) {
        setDownloads(new Map(downloads.map((download) => [download.id, download.url])));
      }
    }

    getDownloadUrls();

    return () => {
      cancelled = true;
    };
  }, [message]);

  return (
    <XStack width='100%' justify={isOwn ? 'flex-end' : 'flex-start'}>
      <YStack
        maxW='76%'
        minW={0}
        bg={isOwn ? '$bgBubbleOwn' : '$bgBubbleOther'}
        borderBottomRightRadius={isOwn ? '$1' : '$3'}
        borderBottomLeftRadius={isOwn ? '$3' : '$1'}
        px='$3'
        py='$2'
        elevation='$1'
      >
        {message.content ? (
          <Text fontSize='$3' lineHeight={20} color='$textPrimary'>
            {message.content}
          </Text>
        ) : null}

        {message.attachments?.length ? (
          <YStack gap='$2' my='$2'>
            {message.attachments.map((attachment) => {
              const url = downloads.get(attachment.id);

              if (!url) {
                return null;
              }

              return <MessageAttachment key={attachment.id} attachment={attachment} url={url} />;
            })}
          </YStack>
        ) : null}

        <XStack justify='flex-end' items='center' gap='$1' mt='$1'>
          <Text fontSize='$1' color='$textSecondary'>
            {format(new Date(message.createdAt), 'dd MMM HH:mm', {
              locale: es,
            })}
          </Text>

          {isOwn ? (
            <Text fontSize='$2' color='$accent'>
              ✓✓
            </Text>
          ) : null}
        </XStack>
      </YStack>
    </XStack>
  );
}

type MessageAttachmentProps = {
  attachment: Message['attachments'][number];
  url: string;
};

function MessageAttachment({ attachment, url }: MessageAttachmentProps) {
  const { contentType } = attachment;

  if (contentType.startsWith('image/')) {
    return <ImageAttachment url={url} fileName={attachment.fileName} />;
  }

  if (contentType.startsWith('video/')) {
    return <VideoAttachment url={url} />;
  }

  if (contentType.startsWith('audio/')) {
    return <AudioAttachment url={url} />;
  }

  return <FileAttachment url={url} fileName={attachment.fileName} />;
}

function EmptyState({ label }: { label: string }) {
  return (
    <YStack flex={1} items='center' justify='center' bg='$bgApp'>
      <YStack bg='$bgApp' px='$4' py='$2' elevation='$1'>
        <Text fontSize='$3' color='$textSecondary'>
          {label}
        </Text>
      </YStack>
    </YStack>
  );
}
