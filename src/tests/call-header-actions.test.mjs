import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL('../components/header-button.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'header-button.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture(
  type = 'PRIVATE',
  empty = async () => {},
  role = 'MEMBER',
  invitation,
  isDeleted,
) {
  const requests = [],
    emptied = [],
    alerts = [],
    cleared = [];
  const conversation = {
    id: 'chat',
    type,
    invitation,
    isDeleted,
    members: [{ userId: 'alice', role }, { userId: 'bob' }],
  };
  const Popover = Object.assign(() => null, {
    Trigger: 'Trigger',
    Content: 'Content',
  });
  const dependencies = {
    './invite-group-dialog': { InviteGroupDialog: () => null },
    './group-management-dialog': { GroupManagementDialog: () => null },
    react: {
      useRef: (current) => ({ current }),
      useState: (value) => [value, () => {}],
    },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      Alert: {
        alert: (title, message, buttons) =>
          alerts.push({ title, message, buttons }),
      },
    },
    tamagui: { Popover, Button: 'Button', Text: 'Text', YStack: 'YStack' },
    'lucide-react-native': {
      Eraser: 'Eraser',
      MoreVertical: 'MoreVertical',
      Radio: 'Radio',
    },
    '@/src/contexts/chat-context': {
      useChatContext: () => ({
        activeConversation: conversation,
        handleEmptyChat: (id) => cleared.push(id),
      }),
    },
    '@/src/contexts/user-context': {
      useUserContext: () => ({ user: { id: 'alice', username: 'Ana' } }),
    },
    '@/src/lib/constants': { COLORS: {} },
    '@/src/services/conversation': {
      conversationService: {
        requestUserConnection: async (data) => requests.push(data),
        emptyMessages: async (data) => {
          emptied.push(data);
          await empty();
        },
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => (name in dependencies ? dependencies[name] : require(name)),
    module,
    module.exports,
  );
  const tree = module.exports.HeaderButton();
  const action = (label) =>
    nodes(tree).find((node) => node.props?.accessibilityLabel === label)
      ?.props.onPress;
  return { action, requests, emptied, alerts, cleared };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('private header requests a connection from the other participant', async () => {
  const f = fixture();
  await f.action('Solicitar que se conecte')();
  assert.deepEqual(f.requests, [
    { senderName: 'Ana', targetUserId: 'bob', conversationId: 'chat' },
  ]);
  assert.equal(f.alerts[0].title, 'Solicitud enviada');
});
test('empty chat requires confirmation and clears local history only after the API succeeds', async () => {
  const f = fixture();
  f.action('Vaciar chat')();
  assert.equal(f.emptied.length, 0);
  assert.equal(f.cleared.length, 0);
  f.alerts[0].buttons.find((button) => button.text === 'Vaciar').onPress();
  await flush();
  assert.deepEqual(f.emptied, [{ conversationId: 'chat' }]);
  assert.deepEqual(f.cleared, ['chat']);
});
test('failed emptying preserves the local history and shows an error', async () => {
  const f = fixture('PRIVATE', async () => {
    throw new Error('network');
  });
  f.action('Vaciar chat')();
  f.alerts[0].buttons.find((button) => button.text === 'Vaciar').onPress();
  await flush();
  assert.deepEqual(f.cleared, []);
  assert.equal(f.alerts.at(-1).title, 'No se pudo vaciar el chat');
});
test('groups support emptying without targeting an arbitrary member for connection requests', () => {
  const f = fixture('GROUP');
  assert.equal(f.action('Solicitar que se conecte'), undefined);
  assert.equal(typeof f.action('Vaciar chat'), 'function');
});

test('only active group owners see the invite action', () => {
  assert.equal(
    typeof fixture('GROUP', undefined, 'OWNER').action('Invitar personas'),
    'function',
  );
  assert.equal(fixture('GROUP').action('Invitar personas'), undefined);
  assert.equal(
    fixture('PRIVATE', undefined, 'OWNER').action('Invitar personas'),
    undefined,
  );
  assert.equal(
    fixture('GROUP', undefined, 'OWNER', {}).action('Invitar personas'),
    undefined,
  );
});

test('group administration options match the current role', () => {
  const owner = fixture('GROUP', undefined, 'OWNER');
  assert.equal(typeof owner.action('Eliminar grupo'), 'function');
  assert.equal(typeof owner.action('Transferir propiedad'), 'function');
  assert.equal(owner.action('Salir del grupo'), undefined);
  const member = fixture('GROUP');
  assert.equal(typeof member.action('Salir del grupo'), 'function');
  assert.equal(member.action('Eliminar grupo'), undefined);
  assert.equal(member.action('Transferir propiedad'), undefined);
});
