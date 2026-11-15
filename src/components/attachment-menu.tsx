import {
  DOCUMENT_PICKER_TYPES,
  getAttachmentContentType,
  type DocumentCategory,
} from '@/src/lib/attachment-types';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Alert } from 'react-native';

import {
  FileText,
  FileUp,
  Image,
  Paperclip,
  Plus,
  Video,
} from 'lucide-react-native';
import { useState } from 'react';
import { Button, Popover, Text, YStack } from 'tamagui';

import { COLORS } from '@/src/lib/constants';
import type { LocalFile } from '@/src/types/file';

type AttachmentMenuProps = {
  disabled?: boolean;
  onFilesSelected: (files: LocalFile[]) => void;
};

export function AttachmentMenu({
  disabled = false,
  onFilesSelected,
}: AttachmentMenuProps) {
  const [open, setOpen] = useState(false);

  async function handleImages() {
    setOpen(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    const files = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? 'image',
      type: asset.mimeType ?? 'image/*',
      size: asset.fileSize,
    })) as LocalFile[];

    onFilesSelected(files);
  }

  async function handleVideos() {
    setOpen(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    const files = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? 'video',
      type: asset.mimeType ?? 'video/*',
      size: asset.fileSize,
    })) as LocalFile[];

    onFilesSelected(files);
  }

  async function handleDocuments(category: DocumentCategory) {
    setOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Unknown GIS/model MIME types must remain selectable on Android/iOS.
        type:
          category === 'pdf'
            ? 'application/pdf'
            : category === 'other'
              ? '*/*'
              : DOCUMENT_PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const files: LocalFile[] = [];
      const unsupported: string[] = [];
      for (const asset of result.assets) {
        const contentType = getAttachmentContentType(asset.name, category);
        if (!contentType) {
          unsupported.push(asset.name);
          continue;
        }
        files.push({
          uri: asset.uri,
          name: asset.name,
          type: contentType,
          size: asset.size ?? new File(asset.uri).size,
        });
      }
      if (unsupported.length) {
        Alert.alert(
          'Formato no compatible',
          `No se agregaron estos archivos: ${unsupported.join(', ')}.`,
        );
      }
      if (files.length) onFilesSelected(files);
    } catch {
      Alert.alert(
        'No se pudieron seleccionar los archivos',
        'Inténtalo de nuevo.',
      );
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} placement='top-start'>
      <Popover.Trigger asChild>
        <Button
          circular
          size='$3'
          disabled={disabled}
          unstyled
          items='center'
          justify='center'
          bg='transparent'
          pressStyle={{
            bg: '$backgroundHover',
          }}
          accessibilityLabel='Enviar archivo'
        >
          <Plus
            size={20}
            color={disabled ? COLORS['text-secondary'] : COLORS['text-primary']}
          />
        </Button>
      </Popover.Trigger>

      <Popover.Content
        width={208}
        p='$1.5'
        borderWidth={1}
        borderColor='$border'
        bg='$bgApp'
        elevation='$4'
      >
        <YStack>
          <AttachmentItem
            icon={<Image size={20} color={COLORS['text-primary']} />}
            label='Fotos'
            onPress={handleImages}
          />

          <AttachmentItem
            icon={<Video size={20} color={COLORS['text-primary']} />}
            label='Videos'
            onPress={handleVideos}
          />

          <AttachmentItem
            icon={<FileText size={20} color={COLORS['text-primary']} />}
            label='PDF'
            onPress={() => handleDocuments('pdf')}
          />

          <AttachmentItem
            icon={<Paperclip size={20} color={COLORS['text-primary']} />}
            label='Documentos'
            onPress={() => handleDocuments('documents')}
          />
          <AttachmentItem
            icon={<FileUp size={20} color={COLORS['text-primary']} />}
            label='Otros archivos'
            onPress={() => handleDocuments('other')}
          />
        </YStack>
      </Popover.Content>
    </Popover>
  );
}

type AttachmentItemProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function AttachmentItem({ icon, label, onPress }: AttachmentItemProps) {
  return (
    <Button
      unstyled
      width='100%'
      flexDirection='row'
      items='center'
      gap='$3'
      px='$3'
      py='$2.5'
      bg='transparent'
      pressStyle={{
        bg: '$backgroundHover',
      }}
      onPress={onPress}
    >
      {icon}

      <Text fontSize='$3' color='$textPrimary'>
        {label}
      </Text>
    </Button>
  );
}
