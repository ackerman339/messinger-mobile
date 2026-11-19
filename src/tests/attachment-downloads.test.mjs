import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadComponent(path, dependencies, extraSource = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source + extraSource, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (name) => dependencies[name] ?? (name === 'react/jsx-runtime' ? require(name) : {}),
    module,
    module.exports,
  );
  return module.exports;
}

const attachment = {
  id: 'attachment-id',
  fileName: 'informe.pdf',
  contentType: 'application/pdf',
};

test('MessageAttachment excludes recorded voice notes from phone downloads', () => {
  const AudioAttachment = () => null;
  const MessageAttachmentDownload = () => null;
  const { MessageAttachment } = loadComponent(
    '../components/messages-list.tsx',
    {
      tamagui: { YStack: 'YStack' },
      '@/src/components/attachments/audio-attachment': { AudioAttachment },
      '@/src/components/attachments/message-attachment-download': { MessageAttachmentDownload },
    },
    '\nexport { MessageAttachment };',
  );
  const render = (file, isVoiceMessage = false) =>
    MessageAttachment({ attachment: file, isVoiceMessage }).props.children;

  assert.equal(render(attachment)[1].type, MessageAttachmentDownload);

  const audio = { ...attachment, fileName: 'entrevista.m4a', contentType: 'audio/mp4' };
  assert.equal(render(audio)[0].type, AudioAttachment);
  assert.equal(render(audio)[1].type, MessageAttachmentDownload);
  assert.equal(render(audio, true)[1], false);

  const recording = { ...audio, fileName: 'voice-01a1f221-2bc8-75e3-80ba-6e72ef4595c4.m4a' };
  assert.equal(render(recording)[0].type, AudioAttachment);
  assert.equal(render(recording)[0].props.isVoiceNote, true);
  assert.equal(render(recording)[1], false);
});

test('pressing Descargar exports the local file and waits for the phone save to finish', async () => {
  const events = [];
  const states = ['idle', null];
  const pending = { current: false };
  let stateIndex = 0;
  let finishSave;
  const { MessageAttachmentDownload } = loadComponent(
    '../components/attachments/message-attachment-download.tsx',
    {
      'lucide-react-native': { Download: 'Download' },
      react: {
        useRef: () => pending,
        useState: () => {
          const index = stateIndex++;
          return [states[index], (value) => { states[index] = value; }];
        },
      },
      'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable' },
      tamagui: { Text: 'Text', XStack: 'XStack', YStack: 'YStack' },
      '@/src/contexts/attachment-context': {
        useAttachmentContext: () => ({
          downloadAttachment: async (...args) => {
            events.push(args);
            return 'file:///cache/attachment-id.pdf';
          },
        }),
      },
      '@/src/services/attachment-downloads': {
        saveAttachmentToPhone: (...args) => {
          events.push(args);
          return new Promise((resolve) => { finishSave = resolve; });
        },
      },
    },
  );
  const button = MessageAttachmentDownload({ attachment }).props.children[0];
  assert.deepEqual(events, []);
  button.props.onPress({ stopPropagation() {} });
  button.props.onPress({ stopPropagation() {} });
  await setImmediate();

  assert.deepEqual(events, [
    ['attachment-id', 'informe.pdf'],
    ['file:///cache/attachment-id.pdf', 'informe.pdf', 'application/pdf'],
  ]);
  assert.equal(states[0], 'saving');

  finishSave(true);
  await setImmediate();
  assert.equal(states[0], 'saved');
});
