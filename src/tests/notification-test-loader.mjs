import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import ts from 'typescript';

/** Executes the production TS functions with platform SDK boundaries mocked, without Metro. */
export function createNotificationLoader(stubs = {}) {
  const urls = new Map();
  const encode = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  function load(url) {
    if (urls.has(url.href)) return urls.get(url.href);
    const stub = Object.entries(stubs).find(([suffix]) => url.pathname.endsWith(suffix));
    if (stub) {
      const result = encode(stub[1]);
      urls.set(url.href, result);
      return result;
    }
    let source = fs.readFileSync(url, 'utf8');
    source = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
    }).outputText;
    source = source
      .replace(
        /import \{ randomUUID \} from 'expo-crypto';/g,
        "import { randomUUID } from 'node:crypto';",
      )
      .replace(
        /import \* as SecureStore from 'expo-secure-store';/g,
        'const SecureStore = globalThis.__notificationTest.secureStore;',
      )
      .replace(
        /import \{ useEffect \} from 'react';/g,
        'const { useEffect } = globalThis.__notificationTest.react;',
      )
      .replace(
        /import \{([^}]+)\} from 'expo-keep-awake';/g,
        'const {$1} = globalThis.__notificationTest.keepAwake;',
      )
      .replace(
        /import \{ router \} from 'expo-router';/g,
        'const router = globalThis.__notificationTest.router;',
      )
      .replace(
        /import \{([^}]+)\} from 'expo-audio';/g,
        'const {$1} = globalThis.__notificationTest.expoAudio ?? {};',
      )
      .replace(/require\((['"])([^'"]+\.wav)\1\)/g, (_, quote, path) => JSON.stringify(path))
      .replace(
        /import Constants, \{([^}]+)\} from 'expo-constants';/g,
        'const Constants = globalThis.__notificationTest.constants; const {$1} = globalThis.__notificationTest;',
      )
      .replace(
        /import \* as Device from 'expo-device';/g,
        'const Device = globalThis.__notificationTest.device;',
      )
      .replace(
        /import\(['"]expo-notifications['"]\)/g,
        'Promise.resolve(globalThis.__notificationTest.notifications)',
      )
      .replace(
        /import \* as Notifications from 'expo-notifications';/g,
        'const Notifications = globalThis.__notificationTest.notifications;',
      )
      .replace(
        /import \* as TaskManager from 'expo-task-manager';/g,
        'const TaskManager = globalThis.__notificationTest.tasks;',
      )
      .replace(
        /import \{([^}]+)\} from 'react-native';/g,
        'const {$1} = globalThis.__notificationTest.native;',
      )
      .replace(
        /import \{ requireOptionalNativeModule \} from 'expo';/g,
        'const requireOptionalNativeModule = () => globalThis.__notificationTest.audio;',
      )
      .replace(
        "require('react-native-callkeep').default",
        'globalThis.__notificationTest.callKeep',
      );
    source = source.replace(
      /from ['"](\.[^'"]+)['"]/g,
      (_, path) => `from '${load(new URL(`${path}.ts`, url))}'`,
    );
    source = source.replace(
      /from ['"](@\/src\/[^'"]+)['"]/g,
      (_, path) =>
        `from '${load(new URL(`${path.slice(6)}.ts`, new URL('../', import.meta.url)))}'`,
    );
    const result = encode(source);
    urls.set(url.href, result);
    return result;
  }
  return (path) => import(load(new URL(`../${path}.ts`, import.meta.url)));
}
export const flush = async () => {
  for (let i = 0; i < 15; i++) await new Promise((resolve) => setImmediate(resolve));
};
