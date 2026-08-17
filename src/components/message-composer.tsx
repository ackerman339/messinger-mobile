import { ChevronRight, Smile } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import { AttachmentMenu } from '@/src/components/attachment-menu';
import { VoiceRecorder } from '@/src/components/voice-recorder';
import { useChatContext } from '@/src/contexts/chat-context';

import type { LocalFile } from '@/src/types/file';

export function MessageComposer() {
  const { activeConversation, receiverId, prepareAttachments, handleSendMessage } =
    useChatContext();

  const [message, setMessage] = useState('');

  const disabled = !activeConversation && !receiverId;

  function handleChange(value: string) {
    setMessage(value);

    if (!value.trim()) {
      return;
    }
  }

  function handleSubmit() {
    const content = message.trim();

    if (!content || disabled) {
      return;
    }

    handleSendMessage(content, []);

    setMessage('');

    Keyboard.dismiss();
  }

  async function uploadFiles(files: LocalFile[]) {
    if (disabled) {
      return;
    }

    const attachments = await prepareAttachments(files);

    handleSendMessage('Nuevo archivo', attachments);
  }

  return (
    <View className='border-t border-border bg-bg-app px-3 py-2'>
      <View className='flex-row items-end gap-2'>
        <AttachmentMenu disabled={disabled} onFilesSelected={uploadFiles} />

        <View className='min-h-11 flex-1 rounded-xl bg-slate-100 px-4 py-2'>
          <TextInput
            className='text-[15px] leading-6 text-text-primary'
            placeholder='Escribe un mensaje'
            placeholderTextColor='#64748b'
            multiline
            editable={!disabled}
            value={message}
            onChangeText={handleChange}
            textAlignVertical='center'
            maxLength={5000}
            onSubmitEditing={(event) => {
              if (!event.nativeEvent.text.includes('\n')) {
                handleSubmit();
              }
            }}
          />
        </View>

        <VoiceRecorder />

        <Pressable
          disabled={disabled}
          className='h-11 w-11 items-center justify-center rounded-full'
          onPress={() => {}}
        >
          <Smile size={22} color={disabled ? '#94a3b8' : '#64748b'} />
        </Pressable>

        <Pressable
          disabled={disabled || !message.trim()}
          className='h-11 w-11 items-center justify-center rounded-full bg-accent disabled:opacity-40'
          onPress={handleSubmit}
        >
          <ChevronRight size={22} color='white' />
        </Pressable>
      </View>
    </View>
  );
}
