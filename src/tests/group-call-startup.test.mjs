import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

test('the app can load the LiveKit chat route on a runtime without DOMException', () => {
  const liveKit = readFileSync(require.resolve('livekit-client'), 'utf8');
  const runtime = createContext({
    exports: {},
    TextEncoder,
    TextDecoder,
    require(name) {
      if (name === './src/group-calls/dom-exception-polyfill') {
        runInContext(compile('../group-calls/dom-exception-polyfill.ts'), runtime);
      } else if (name === 'expo-router/entry') {
        runInContext(liveKit, runtime, { displayErrors: false });
      } else {
        assert.equal(name, './src/tasks/call-notifications');
      }
    },
  });

  assert.equal(runInContext('typeof DOMException', runtime), 'undefined');
  runInContext(compile('../../index.js'), runtime);
  assert.equal(runInContext('typeof LivekitClient.Room', runtime), 'function');
});
