import { ChevronRight, Smile } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import { AttachmentMenu } from '@/src/components/attachment-menu';
import { VoiceRecorder } from '@/src/components/voice-recorder';
import { useChatContext } from '@/src/contexts/chat-context';
import { useVoiceRecorder } from '@/src/hooks/use-voice-recorder';

import type { LocalFile } from '@/src/types/file';

export function MessageComposer() {
  const { activeConversation, receiverId, prepareAttachments, handleSendMessage } =
    useChatContext();

  const [message, setMessage] = useState('');

  const { isRecording, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  const disabled = !activeConversation && !receiverId;

  function handleChange(value: string) {
    setMessage(value);
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

    try {
      const attachments = await prepareAttachments(files);

      await handleSendMessage('Nuevo archivo', attachments);
    } catch (error) {
      console.error('[attachments] failed to send files:', error);
    }
  }

  async function handleStartRecording() {
    if (disabled) {
      return;
    }

    try {
      await startRecording();
    } catch (error) {
      console.error('[voice] failed to start recording:', error);
    }
  }

  async function handleStopRecording() {
    try {
      const recording = await stopRecording();

      if (!recording) {
        return;
      }

      const attachments = await prepareAttachments([recording]);

      await handleSendMessage('Nota de voz', attachments);
    } catch (error) {
      console.error('[voice] failed to send recording:', error);
    }
  }

  async function handleCancelRecording() {
    try {
      await cancelRecording();
    } catch (error) {
      console.error('[voice] failed to cancel recording:', error);
    }
  }

  return (
    <View className='border-t border-border bg-bg-app px-3 py-2'>
      {isRecording ? (
        <View style={{ height: 44 }}>
          <VoiceRecorder
            isRecording={isRecording}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
            onCancel={handleCancelRecording}
          />
        </View>
      ) : (
        <View className='flex-row items-end gap-x-1'>
          <AttachmentMenu disabled={disabled} onFilesSelected={uploadFiles} />

          <Pressable
            disabled={disabled}
            className='h-10 w-10 items-center justify-center rounded-full'
            onPress={() => {}}
          >
            <Smile size={22} color={disabled ? '#94a3b8' : '#64748b'} />
          </Pressable>

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

          {message ? (
            <Pressable
              disabled={disabled || !message.trim()}
              className='h-11 w-11 items-center justify-center rounded-full bg-accent disabled:opacity-40'
              onPress={handleSubmit}
            >
              <ChevronRight size={22} color='white' />
            </Pressable>
          ) : (
            <VoiceRecorder
              isRecording={false}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onCancel={handleCancelRecording}
            />
          )}
        </View>
      )}
    </View>
  );
}
