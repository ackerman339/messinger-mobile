import { Download } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { useAttachmentContext } from '@/src/contexts/attachment-context';
import { saveAttachmentToPhone } from '@/src/services/attachment-downloads';

import type { FileAttachment } from '@/src/types/file';

export function MessageAttachmentDownload({ attachment }: { attachment: FileAttachment }) {
  const { id, fileName, contentType } = attachment;
  const { downloadAttachment } = useAttachmentContext();
  const savingRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (savingRef.current) return;

    savingRef.current = true;
    setStatus('saving');
    setError(null);

    try {
      const uri = await downloadAttachment(id, fileName);
      const saved = await saveAttachmentToPhone(uri, fileName, contentType);
      setStatus(saved ? 'saved' : 'idle');
    } catch (error) {
      setStatus('idle');
      setError(error instanceof Error ? error.message : 'No se pudo guardar el archivo.');
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <YStack width={240} gap='$1'>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Descargar ${fileName}`}
        disabled={status === 'saving'}
        onPress={(event) => {
          event.stopPropagation();
          void handleDownload();
        }}
      >
        <XStack
          bg='$accent'
          px='$3'
          py='$2'
          items='center'
          justify='center'
          gap='$2'
          style={{ borderRadius: 8 }}
        >
          {status === 'saving' ? (
            <ActivityIndicator color='white' />
          ) : (
            <>
              <Download size={18} color='white' />
              <Text color='white'>Descargar</Text>
            </>
          )}
        </XStack>
      </Pressable>
      {status === 'saved' && (
        <Text fontSize='$2' color='$textSecondary'>Guardado en Descargas Pulse</Text>
      )}
      {error && <Text fontSize='$2' color='$red10'>{error}</Text>}
    </YStack>
  );
}
