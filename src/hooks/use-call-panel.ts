import { useEffect, useState } from 'react';
import { useCallContext } from '../contexts/call-context';
import { useChatContext } from '../contexts/chat-context';
import { nativeCallService } from '../services/native-call-service';
import { isTerminal } from '../types/call';

export function useCallPanel() {
  const context = useCallContext();
  const { call, native } = context;
  const { conversations } = useChatContext();
  const [now, setNow] = useState(Date.now);
  const visible = !!call;
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible]);
  let participantName = call?.participantName || 'Contacto';
  for (const conversation of conversations.values()) {
    const member = conversation.members.find((member) => member.userId === call?.participantId);
    if (!call?.participantName && member?.username) {
      participantName = member.username;
      break;
    }
  }
  const participantId = call?.participantId;
  const callId = call?.callId;
  useEffect(() => {
    if (callId && participantId)
      nativeCallService.updateName(callId, participantName, participantId);
  }, [callId, participantId, participantName]);
  const terminal = !!call && call.status !== 'requesting' && isTerminal(call.status);
  const canAccept = call?.incoming === true && call.status === 'ringing' && !call.answering;
  const elapsed = call?.connectedAt
    ? Math.max(0, Math.floor((now - Date.parse(call.connectedAt)) / 1000))
    : 0;
  const duration = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
  const labels = {
    requesting: call?.incoming ? 'Consultando llamada…' : 'Iniciando llamada…',
    ringing: call?.answering
      ? (call.notice ?? 'Procesando llamada…')
      : call?.incoming
        ? 'Llamada entrante'
        : 'Llamando…',
    accepted: 'Conectando…',
    connected: call?.held ? 'Llamada en espera' : duration,
    ended: 'Llamada finalizada',
    rejected: 'Llamada rechazada',
    missed: 'Sin respuesta',
    failed: 'No se pudo conectar',
  };
  return {
    ...context,
    participantName,
    duration,
    terminal,
    canAccept,
    initials: participantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    statusLabel: call ? labels[call.status] : '',
    canEnd: !!call && !terminal && !canAccept,
    canControlMedia: !!call?.selected && !!call.local && !terminal && !call.held,
    audioLabel:
      native.route === 'Bluetooth'
        ? 'Bluetooth'
        : native.route === 'Headset'
          ? 'Audífonos'
          : native.speaker
            ? 'Altavoz'
            : native.route === 'Phone'
              ? 'Auricular'
              : 'Audio',
  };
}
export type CallPanelModel = ReturnType<typeof useCallPanel>;
