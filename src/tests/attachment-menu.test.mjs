import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => (name in dependencies ? dependencies[name] : require(name)),
    module,
    module.exports,
  );
  return module.exports;
}
const types = load('../lib/attachment-types.ts');
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture(result) {
  const selected = [],
    options = [],
    alerts = [];
  const Popover = Object.assign(() => null, {
    Trigger: 'Trigger',
    Content: 'Content',
  });
  const { AttachmentMenu } = load('../components/attachment-menu.tsx', {
    react: { useState: (initial) => [initial, () => {}] },
    'expo-document-picker': {
      getDocumentAsync: async (config) => {
        options.push(config);
        if (result instanceof Error) throw result;
        return result;
      },
    },
    'expo-image-picker': {},
    'expo-file-system': {
      File: class {
        size = 321;
      },
    },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    'lucide-react-native': {
      FileText: 'FileText',
      FileUp: 'FileUp',
      Image: 'Image',
      Paperclip: 'Paperclip',
      Plus: 'Plus',
      Video: 'Video',
    },
    tamagui: { Popover, Button: 'Button', Text: 'Text', YStack: 'YStack' },
    '@/src/lib/constants': { COLORS: {} },
    '@/src/lib/attachment-types': types,
  });
  const tree = AttachmentMenu({
    onFilesSelected: (files) => selected.push(files),
  });
  const pick = (label) =>
    nodes(tree)
      .find((node) => node.props?.label === label)
      .props.onPress();
  return { selected, options, alerts, pick };
}
const asset = (name, extra = {}) => ({
  name,
  uri: `file:///cache/${name}`,
  size: 100,
  ...extra,
});
test('documents include OpenDocument formats and normalize their MIME types', async () => {
  const f = fixture({
    canceled: false,
    assets: [asset('report.ODT', { mimeType: 'application/octet-stream' })],
  });
  await f.pick('Documentos');
  for (const type of ['text', 'spreadsheet', 'presentation'])
    assert.ok(
      f.options[0].type.includes(`application/vnd.oasis.opendocument.${type}`),
    );
  assert.equal(f.options[0].multiple, true);
  assert.equal(f.options[0].copyToCacheDirectory, true);
  assert.equal(
    f.selected[0][0].type,
    'application/vnd.oasis.opendocument.text',
  );
});
test('other files allow native providers with unknown MIME types and preserve upload metadata', async () => {
  const f = fixture({
    canceled: false,
    assets: [
      asset('map.KML', { mimeType: 'application/xml' }),
      asset('geometry.geojson', { mimeType: 'application/json' }),
      asset('model.SKP', { size: undefined }),
      asset('projection.prj'),
    ],
  });
  await f.pick('Otros archivos');
  assert.equal(f.options[0].type, '*/*');
  assert.equal(f.options[0].copyToCacheDirectory, true);
  assert.deepEqual(
    f.selected[0].map((file) => file.type),
    [
      'application/vnd.google-earth.kml+xml',
      'application/geo+json',
      'application/vnd.google.sketchup',
      'application/octet-stream',
    ],
  );
  assert.equal(f.selected[0][2].size, 321);
  assert.equal(f.selected[0][0].uri, 'file:///cache/map.KML');
});
test('unsupported extensions are reported and do not enter the upload selection', async () => {
  const f = fixture({
    canceled: false,
    assets: [asset('archive.zip'), asset('program.exe')],
  });
  await f.pick('Otros archivos');
  assert.deepEqual(
    f.selected[0].map((file) => file.name),
    ['archive.zip'],
  );
  assert.equal(f.alerts[0][0], 'Formato no compatible');
  assert.ok(f.alerts[0][1].includes('program.exe'));
});
test('canceling the native picker leaves the current attachments unchanged', async () => {
  const f = fixture({ canceled: true, assets: null });
  await f.pick('Otros archivos');
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.alerts, []);
});
test('native picker failures are handled without sending files', async () => {
  const f = fixture(new Error('picker unavailable'));
  await f.pick('Otros archivos');
  assert.deepEqual(f.selected, []);
  assert.equal(f.alerts[0][0], 'No se pudieron seleccionar los archivos');
});
test('the extra extension set matches the web client selection', () => {
  assert.deepEqual(
    Object.keys(types.OTHER_FILE_TYPES).sort(),
    [
      '.kml',
      '.kmz',
      '.shp',
      '.shx',
      '.dbf',
      '.prj',
      '.zip',
      '.rar',
      '.tar',
      '.apk',
      '.dmg',
      '.geojson',
      '.gpx',
      '.tab',
      '.tif',
      '.tiff',
      '.dae',
      '.skp',
    ].sort(),
  );
});
