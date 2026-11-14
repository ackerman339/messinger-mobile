let userId: string | undefined;
let conversationId: string | undefined;
let callInProgress = false;
let loggedOut = false;
let version = 0;
const messages = new Map<string, { source: 'local' | 'remote'; at: number }>();
const dismissedCalls = new Set<string>();

export function setNotificationUser(id: string) {
  // Initial hydration belongs to the session already read by the headless push task.
  // Only a logout or an actual account change invalidates that task's queued work.
  if (id !== userId && (userId !== undefined || loggedOut)) {
    messages.clear();
    dismissedCalls.clear();
    conversationId = undefined;
    version++;
  }
  userId = id;
  loggedOut = false;
}

export function clearNotificationSession() {
  version++;
  userId = undefined;
  conversationId = undefined;
  callInProgress = false;
  loggedOut = true;
  messages.clear();
  dismissedCalls.clear();
}

export function getNotificationContext() {
  return { userId, conversationId, callInProgress, loggedOut, version };
}

export function setVisibleConversation(id?: string) {
  conversationId = id;
}

export function setCallInProgress(active: boolean) {
  callInProgress = active;
}

export function isConversationVisible(id: string) {
  return conversationId === id && !callInProgress;
}

export function claimMessageNotification(id: string, source: 'local' | 'remote') {
  const now = Date.now();
  for (const [key, value] of messages) if (now - value.at > 10 * 60_000) messages.delete(key);
  if (messages.has(id)) return false;
  messages.set(id, { source, at: now });
  if (messages.size > 512) messages.delete(messages.keys().next().value!);
  return true;
}

export function isLocalMessageNotification(id: string) {
  return messages.get(id)?.source === 'local';
}

export function forgetMessageNotification(id: string) {
  messages.delete(id);
}

export function blockCallNotification(id: string) {
  dismissedCalls.add(id);
  if (dismissedCalls.size > 256) dismissedCalls.delete(dismissedCalls.values().next().value!);
}

export function isCallNotificationBlocked(id: string) {
  return dismissedCalls.has(id);
}
