import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const source = fs.readFileSync(
    new URL(`../${file}`, import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name in dependencies) return dependencies[name];
      const native = {
        'react-native': {
          ActivityIndicator: 'ActivityIndicator',
          FlatList: 'FlatList',
          Pressable: 'Pressable',
          ScrollView: 'ScrollView',
          AppState: {
            currentState: 'active',
            addEventListener: () => ({ remove() {} }),
          },
          BackHandler: { addEventListener: () => ({ remove() {} }) },
        },
        tamagui: {
          Button: 'Button',
          Text: 'Text',
          Input: 'Input',
          XStack: 'XStack',
          YStack: 'YStack',
        },
        'lucide-react-native': { Check: 'Check', Users: 'Users' },
        './group-dialog': { GroupDialog: 'GroupDialog' },
        './group-member-option': { GroupMemberOption: 'GroupMemberOption' },
        '@/src/lib/constants': { COLORS: {} },
        '@/src/hooks/use-message-notifications': {
          useMessageNotifications() {},
        },
      };
      return native[name] ?? require(name);
    },
    module,
    module.exports,
  );
  return module.exports;
}
function service(
  bootstrap = async () => ({ page: [], nextCursor: null }),
) {
  return load('services/groups.ts', {
    './conversation': { conversationService: { getBootstrap: bootstrap } },
    '@/src/clients/websocket-client': { wsClient: {} },
  });
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function hooks(initials = []) {
  let index = 0;
  const state = [];
  return {
    state,
    react: {
      useState(value) {
        const i = index++;
        state[i] = i in initials ? initials[i] : value;
        return [
          state[i],
          (next) => {
            state[i] = typeof next === 'function' ? next(state[i]) : next;
          },
        ];
      },
      useRef: (current) => ({ current }),
      useEffect() {},
    },
  };
}
test('contact picker loads every page, deduplicates contacts and excludes self and group members', async () => {
  const calls = [];
  const groups = service(async ({ cursor }) => {
    calls.push(cursor);
    return {
      page: [
        {
          type: 'PRIVATE',
          members: [
            { userId: 'me', username: 'Yo' },
            { userId: 'a', username: 'Ana' },
            { userId: cursor ? 'b' : 'existing', username: 'Bob' },
          ],
        },
      ],
      nextCursor: cursor ? null : 'page-2',
    };
  });
  const all = await groups.getAllConversations();
  const contacts = groups.inviteCandidates(
    all,
    { members: [{ userId: 'existing' }] },
    'me',
  );
  assert.deepEqual(calls, [null, 'page-2']);
  assert.deepEqual(
    contacts.map((item) => item.userId),
    ['a', 'b'],
  );
});
test('pending invitations retain group names and do not fabricate membership', () => {
  const group = service().invitationConversation({
    conversationId: 'g',
    groupName: 'Equipo',
    invitedBy: 'owner',
    invitationId: 'i',
  });
  assert.equal(group.name, 'Equipo');
  assert.equal(group.type, 'GROUP');
  assert.deepEqual(group.members, []);
  assert.equal(group.invitation.invitationId, 'i');
});
test('create group opens the new conversation with its name and owner', async () => {
  const h = hooks([' Equipo ', false, '']);
  const stored = [],
    selected = [],
    closed = [];
  const tree = load('components/create-group-dialog.tsx', {
    react: h.react,
    '@/src/contexts/user-context': {
      useUserContext: () => ({ user: { id: 'me', username: 'Yo' } }),
    },
    '@/src/contexts/chat-context': {
      useChatContext: () => ({
        handleNewConversation: (c) => stored.push(c),
        handleCurrentConversation: (id) => selected.push(id),
        handleReceiverId() {},
      }),
    },
    '@/src/services/conversation': {
      conversationService: {
        createGroup: async (dto) => {
          assert.deepEqual(dto, { name: 'Equipo', members: [] });
          return { id: 'new', name: 'Equipo' };
        },
      },
    },
    '@/src/services/groups': service(),
  }).CreateGroupDialog({
    open: true,
    onOpenChange: (open) => closed.push(open),
  });
  await nodes(tree)
    .find((node) => node.props?.accessibilityLabel === 'Crear grupo')
    .props.onPress();
  assert.equal(stored[0].name, 'Equipo');
  assert.equal(stored[0].members[0].role, 'OWNER');
  assert.deepEqual(selected, ['new']);
  assert.deepEqual(closed, [false]);
});
function panel(action) {
  const h = hooks();
  const stored = [],
    removed = [];
  const tree = load('components/group-invitation-panel.tsx', {
    react: h.react,
    '@/src/contexts/chat-context': {
      useChatContext: () => ({
        activeConversation: { id: 'g', name: 'Equipo', invitation: {} },
        handleNewConversation: (c) => stored.push(c),
        handleRemoveConversation: (id) => removed.push(id),
      }),
    },
    '@/src/services/groups': {
      groupService: { accept: action, reject: action },
      groupError: (error) => error.message,
      getAllConversations: async () => [{ id: 'g', name: 'Equipo' }],
    },
  }).GroupInvitationPanel();
  const button = (label) =>
    nodes(tree).find((node) => node.props?.accessibilityLabel === label);
  return { button, stored, removed, state: h.state };
}
test('acceptance waits for confirmation and then loads the group', async () => {
  let finish;
  const f = panel(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.button('Aceptar invitación').props.onPress();
  assert.equal(f.stored.length, 0);
  finish();
  await pending;
  assert.equal(f.stored[0].id, 'g');
});
test('failed rejection preserves the invitation and exposes an error', async () => {
  const f = panel(async () => {
    throw new Error('Sin conexión');
  });
  await f.button('Rechazar invitación').props.onPress();
  assert.deepEqual(f.removed, []);
  assert.equal(f.state[2], 'Sin conexión');
});
test('confirmed rejection removes the pending conversation', async () => {
  const f = panel(async () => {});
  await f.button('Rechazar invitación').props.onPress();
  assert.deepEqual(f.removed, ['g']);
});
test('multi-select sends each selected invitation and preserves failed selections for retry', async () => {
  const h = hooks([[], ['a', 'b'], [], false, false, '', '', 0]);
  const calls = [];
  const tree = load('components/invite-group-dialog.tsx', {
    react: h.react,
    '@/src/contexts/user-context': {
      useUserContext: () => ({ user: { id: 'me' } }),
    },
    '@/src/services/groups': {
      groupService: {
        invite: async (_group, id) => {
          calls.push(id);
          if (id === 'b') throw new Error('Falló Bob');
        },
      },
      groupError: (error) => error.message,
    },
  }).InviteGroupDialog({
    group: { id: 'g', name: 'Equipo' },
    onClose() {},
  });
  const button = nodes(tree)
    .filter(
      (node) => node.props?.accessibilityLabel === 'Enviar invitaciones',
    )
    .at(-1);
  await button.props.onPress();
  assert.deepEqual(calls, ['a', 'b']);
  assert.deepEqual(h.state[1], ['b']);
  assert.deepEqual(h.state[2], ['a']);
  assert.equal(h.state[5], 'Falló Bob');
});
test('the provider adds incoming invitations as pending conversations and removes rejected ones', () => {
  const effects = [],
    events = new Map();
  const h = hooks();
  const react = {
    ...h.react,
    useEffect: (effect) => effects.push(effect),
    useMemo: (callback) => callback(),
  };
  const { ChatProvider } = load('providers/chat-provider.tsx', {
    react: { ...react, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    '@/src/services/message-sync': { messageSync: { getSnapshot: () => ({ connectionEpoch: 1 }) } },
    'react-router-dom': {
      useSearchParams: () => [new URLSearchParams(), () => {}],
    },
    '@/src/contexts/user-context': {
      useUserContext: () => ({ user: { id: 'me' } }),
    },
    '@/src/contexts/chat-context': {
      ChatContext: { Provider: () => null },
    },
    '@/src/services/conversation': { conversationService: {} },
    '@/src/services/files': { fileService: {} },
    '@/src/services/user': { userService: {} },
    '@/src/services/groups': service(),
    '@/src/hooks/use-cursor-pagination': {
      useCursorPagination: () => ({ items: [] }),
    },
    '@/src/clients/websocket-client': {
      wsClient: {
        on: (event, handler) => {
          events.set(event, handler);
          return () => events.delete(event);
        },
      },
    },
    '@/src/types/websocket': {
      WS_CLIENT_EVENTS: {},
      WS_SERVER_EVENTS: Object.fromEntries(
        [
          'GROUP_INVITATION',
          'GROUP_INVITATION_REJECTED',
          'GROUP_MEMBER_JOINED',
          'GROUP_MEMBER_LEFT',
          'GROUP_MEMBER_REMOVED',
          'GROUP_OWNER_CHANGED',
          'GROUP_DELETED',
          'NEW_MESSAGE',
        ].map((event) => [event, event]),
      ),
    },
  });
  const provider = ChatProvider({ children: null });
  effects.forEach((effect) => effect());
  events.get('GROUP_INVITATION')({
    conversationId: 'g',
    groupName: 'Equipo',
    invitedBy: 'owner',
  });
  assert.equal(h.state[0].get('g').name, 'Equipo');
  assert.ok(h.state[0].get('g').invitation);
  events.get('GROUP_INVITATION_REJECTED')({ conversationId: 'g' });
  assert.equal(h.state[0].has('g'), false);
  h.state[0].set('active', {
    id: 'active',
    type: 'GROUP',
    members: [],
    messages: [],
  });
  provider.props.value.handleCurrentConversation('active');
  events.get('GROUP_DELETED')({ conversationId: 'active' });
  assert.equal(h.state[0].get('active').isDeleted, true);
  assert.equal(h.state[1], 'active');
});

test('pending invitations never mount message history or composer on the chat screen', () => {
  const MessageList = () => null,
    MessageComposer = () => null,
    GroupInvitationPanel = () => null;
  const component = (name) => ({ [name]: () => null });
  const ChatPage = load('../app/chat.tsx', {
    react: { useState: (initialize) => [initialize()], useEffect: () => {} },
    'react-native': {
      Keyboard: { isVisible: () => false },
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' },
      View: 'View',
    },
    'react-native-reanimated': {
      __esModule: true,
      default: { View: 'AnimatedView' },
      useAnimatedStyle: (fn) => fn(),
      withTiming: (value) => value,
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/src/contexts/chat-context': {
      useChatContext: () => ({
        activeConversation: { id: 'g', invitation: {} },
      }),
    },
    '@/src/components/chat-header': component('ChatHeader'),
    '@/src/components/conversations-list': component('ConversationList'),
    '@/src/components/messages-list': { MessageList },
    '@/src/components/message-composer': { MessageComposer },
    '@/src/components/group-invitation-panel': { GroupInvitationPanel },
    '@/src/providers/chat-provider': component('ChatProvider'),
    '@/src/providers/call-provider': component('CallProvider'),
    '@/src/providers/attachment-provider': component('AttachmentProvider'),
    '@/src/providers/user-provider': component('UserProvider'),
    '@/src/calls/componentes/call-panel': component('CallPanel'),
    '@/src/group-calls/group-call-provider': component(
      'GroupCallProvider',
    ),
    '@/src/group-calls/group-call-panel': component('GroupCallPanel'),
  }).default;
  const content = nodes(ChatPage()).find(
    (node) => node.type?.name === 'ChatContent',
  );
  assert.ok(content);
  const tree = content.type();
  assert.ok(
    nodes(tree).some((node) => node.type === GroupInvitationPanel),
  );
  assert.ok(
    !nodes(tree).some(
      (node) => node.type === MessageList || node.type === MessageComposer,
    ),
  );
});
test('native dialogs honor Android back requests and keep pending actions open', () => {
  let closed = 0;
  const props = {
    open: true,
    title: 'Grupo',
    description: 'Descripción',
    onClose: () => closed++,
    children: null,
  };
  const { GroupDialog } = load('components/group-dialog.tsx', {
    'react-native': {
      Modal: 'Modal',
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' },
      Pressable: 'Pressable',
      StyleSheet: { absoluteFillObject: {} },
      View: 'View',
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'lucide-react-native': { X: 'X' },
  });
  GroupDialog(props).props.onRequestClose();
  assert.equal(closed, 1);
  GroupDialog({ ...props, busy: true }).props.onRequestClose();
  assert.equal(closed, 1);
});
