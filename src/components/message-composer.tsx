import { ChevronRight, Smile } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { EmojiPicker } from 'rn-expo-emoji-picker';

import { AttachmentMenu } from '@/src/components/attachment-menu';
import { VoiceRecorder } from '@/src/components/voice-recorder';
import { useChatContext } from '@/src/contexts/chat-context';
import { useVoiceRecorder } from '@/src/hooks/use-voice-recorder';

import { COLORS } from '@/src/lib/constants';
import type { LocalFile } from '@/src/types/file';

export function MessageComposer() {
  const {
    activeConversation,
    receiverId,
    isLoadingAttachment,
    prepareAttachments,
    handleSendMessage,
  } = useChatContext();

  const inputRef = useRef<TextInput>(null);

  const [message, setMessage] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const [selection, setSelection] = useState({
    start: 0,
    end: 0,
  });

  const { isRecording, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  const disabled = !activeConversation && !receiverId;

  function handleChange(value: string) {
    setMessage(value);
  }

  function handleToggleEmojiPicker() {
    if (disabled || isLoadingAttachment) {
      return;
    }

    setEmojiPickerOpen((open) => !open);
  }

  function handleEmojiSelected(emoji: string) {
    const { start, end } = selection;

    const newMessage = message.slice(0, start) + emoji + message.slice(end);

    const cursorPosition = start + emoji.length;

    setMessage(newMessage);

    setSelection({
      start: cursorPosition,
      end: cursorPosition,
    });

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleSubmit() {
    const content = message.trim();

    if (!content || disabled) {
      return;
    }

    setMessage('');
    setSelection({
      start: 0,
      end: 0,
    });

    requestAnimationFrame(() => {
      inputRef.current?.blur();
      Keyboard.dismiss();
    });

    setEmojiPickerOpen(false);
    handleSendMessage(content, []);
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
        <>
          <View className='flex-row items-end gap-x-1'>
            <AttachmentMenu
              disabled={disabled || isLoadingAttachment}
              onFilesSelected={uploadFiles}
            />

            <Pressable
              disabled={disabled || isLoadingAttachment}
              className='h-10 w-10 items-center justify-center rounded-full'
              onPress={handleToggleEmojiPicker}
            >
              <Smile
                size={22}
                color={
                  disabled || isLoadingAttachment
                    ? COLORS['text-secondary']
                    : COLORS['text-primary']
                }
              />
            </Pressable>

            <View className='min-h-11 flex-1 rounded-xl bg-slate-100 px-4 py-2'>
              <TextInput
                ref={inputRef}
                className='text-[15px] leading-6 text-text-primary'
                placeholder='Escribe un mensaje'
                placeholderTextColor={COLORS['text-secondary']}
                multiline
                editable={!disabled && !isLoadingAttachment}
                value={message}
                selection={selection}
                onSelectionChange={(event) => {
                  setSelection(event.nativeEvent.selection);
                }}
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
                disabled={disabled || !message.trim() || isLoadingAttachment}
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

          {emojiPickerOpen && (
            <View className='mt-2' style={{ height: 320 }}>
              <EmojiPicker
                onEmojiSelected={(emoji) => {
                  handleEmojiSelected(emoji.emoji);
                }}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
