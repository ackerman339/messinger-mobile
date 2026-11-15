import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const source = fs.readFileSync(
  new URL('../components/conversations-list.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  fileName: 'conversation-list.tsx',
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
function Calls() {
  return React.createElement('section', null, 'calls fixture');
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function fixture() {
  let selected = 'chats';
  let paginationEnabled;
  const hooks = {
    useState: (initial) =>
      initial === 'chats'
        ? [
            selected,
            (value) => {
              selected = value;
            },
          ]
        : [initial, () => {}],
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useEffect() {},
    useLayoutEffect() {},
  };
  const context = {
    conversations: new Map(),
    activeConversation: null,
    loadingConversations: false,
    hasMoreConversations: true,
    handleCurrentConversation() {},
    loadMoreConversations() {},
    handleNewConversation() {},
  };
  function dependency(name) {
    if (name === 'react') return hooks;
    if (name.includes('call-history-list')) return { CallHistoryList: Calls };
    if (name.includes('chat-menu'))
      return { ChatMenu: () => React.createElement('button', null, 'Menu') };
    if (name.includes('chat-context')) return { useChatContext: () => context };
    if (name.includes('user-context'))
      return { useUserContext: () => ({ user: { id: 'alice' } }) };
    if (name.includes('use-infinite-scroll'))
      return {
        useInfiniteScrollSentinel: (options) => {
          paginationEnabled = options.enabled;
          return null;
        },
      };
    if (name === 'react-native')
      return {
        FlatList: 'FlatList',
        Pressable: 'Pressable',
        ActivityIndicator: 'ActivityIndicator',
      };
    if (name === 'tamagui')
      return {
        Text: 'Text',
        XStack: 'XStack',
        YStack: 'YStack',
        Input: 'Input',
      };
    if (name === 'lucide-react-native')
      return { MessagesSquare: 'MessagesSquare', Phone: 'Phone' };
    if (name.includes('lib/constants'))
      return { COLORS: { accent: '#54a9eb', 'text-secondary': '#707579' } };
    if (name.startsWith('@')) return {};
    return require(name);
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    dependency,
    module,
    module.exports,
  );
  return {
    render: () => module.exports.ConversationList(),
    paginationEnabled: () => paginationEnabled,
  };
}
test('mobile tabs switch the sidebar between chats and calls', () => {
  const view = fixture();
  let tree = view.render();
  const tabs = nodes(tree).filter(
    (node) => node.props?.accessibilityRole === 'tab',
  );
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].props.accessibilityState.selected, true);
  assert.equal(tabs[1].props.accessibilityLabel, 'Llamadas');
  assert.equal(
    nodes(tree).some((node) => node.type === Calls),
    false,
  );
  tabs[1].props.onPress();
  tree = view.render();
  assert.ok(nodes(tree).some((node) => node.type === Calls));
  assert.ok(nodes(tree).some((node) => node.props?.display === 'none'));
  const chats = nodes(tree).find(
    (node) => node.props?.accessibilityLabel === 'Chats',
  );
  chats.props.onPress();
  tree = view.render();
  assert.equal(
    nodes(tree).some((node) => node.type === Calls),
    false,
  );
});
