import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Download, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

type FileAttachmentProps = {
  url: string;
  fileName: string;
};

export function FileAttachment({ url, fileName }: FileAttachmentProps) {
  const [loading, setLoading] = useState(false);

  async function handleOpenFile() {
    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const file = await File.downloadFileAsync(url, Paths.cache, {
        idempotent: true,
      });

      const available = await Sharing.isAvailableAsync();

      if (!available) {
        throw new Error('File sharing is not available');
      }

      await Sharing.shareAsync(file.uri);
    } catch (error) {
      console.error('Failed to open file:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable onPress={handleOpenFile} disabled={loading}>
      <XStack minW={220} maxW={280} items='center' gap='$3' bg='$background' px='$3' py='$2.5'>
        <XStack width={40} height={40} items='center' justify='center' bg='$accent'>
          <FileText size={20} color='white' />
        </XStack>

        <YStack flex={1} minW={0}>
          <Text
            fontSize='$3'
            fontWeight='500'
            color='$textPrimary'
            numberOfLines={1}
            ellipsizeMode='middle'
          >
            {fileName}
          </Text>

          <Text fontSize='$2' color='$textSecondary' mt='$0.5'>
            {loading ? 'Descargando...' : 'Tocar para abrir'}
          </Text>
        </YStack>

        {loading ? <ActivityIndicator size='small' /> : <Download size={20} color='#64748b' />}
      </XStack>
    </Pressable>
  );
}
