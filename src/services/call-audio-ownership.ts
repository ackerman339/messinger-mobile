let stopRecorder: (() => Promise<void>) | undefined;
let stopping: Promise<void> | undefined;

/** Finish a chat recorder before WebRTC takes the microphone or configures its audio session. */
export function registerChatRecorder(stop: () => Promise<void>) {
  stopRecorder = stop;
  return () => {
    if (stopRecorder === stop) stopRecorder = undefined;
  };
}
export async function releaseChatRecorderForCall() {
  if (stopping) return stopping;
  const stop = stopRecorder;
  if (!stop) return;
  stopRecorder = undefined;
  stopping = stop().finally(() => {
    stopping = undefined;
  });
  return stopping;
}
