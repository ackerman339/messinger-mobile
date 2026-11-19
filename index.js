// LiveKit reads DOMException when its module loads, before a chat can render.
import './src/group-calls/dom-exception-polyfill';
// Define push handlers before the Router mounts, including Android headless starts.
import './src/tasks/call-notifications';
import 'expo-router/entry';
