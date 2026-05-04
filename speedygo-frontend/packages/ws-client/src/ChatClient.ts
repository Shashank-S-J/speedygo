import { WSManager } from './WSManager';
import { ChatMessage, SendMessagePayload, MessageType } from '@speedygo/types';

const WS_BASE = (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_API_URL'] : null) ?? 'http://localhost:8080';
const WS_URL = WS_BASE.replace(/^http/, 'ws');

export class ChatClient {
  private manager: WSManager;
  private pendingUuid: string | null = null;
  private ackHandlers: Set<(uuid: string) => void> = new Set();
  private messageHandlers: Set<(msg: ChatMessage) => void> = new Set();

  constructor(bookingId: number, token: string, since?: string) {
    const params = new URLSearchParams();
    params.set('token', token);
    if (since) params.set('since', since);
    const url = `${WS_URL}/chat/${bookingId}?${params.toString()}`;
    this.manager = new WSManager(url);

    this.manager.onMessage((raw) => {
      const data = raw as ChatMessage & { error?: string; info?: string };
      if (data.error || data.info) return;
      if (data.client_uuid && data.client_uuid === this.pendingUuid) {
        this.ackHandlers.forEach(h => h(data.client_uuid));
        this.pendingUuid = null;
      }
      this.messageHandlers.forEach(h => h(data));
    });
  }

  connect() { this.manager.connect(); }
  disconnect() { this.manager.disconnect(); }
  isConnected() { return this.manager.isConnected(); }

  onMessage(handler: (msg: ChatMessage) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: (connected: boolean) => void) {
    return this.manager.onStatus(handler);
  }

  onAck(handler: (uuid: string) => void) {
    this.ackHandlers.add(handler);
    return () => this.ackHandlers.delete(handler);
  }

  sendMessage(type: MessageType, content: string): string {
    const uuid = crypto.randomUUID();
    this.pendingUuid = uuid;
    const payload: SendMessagePayload = { client_uuid: uuid, type, content };
    this.manager.send(payload);
    return uuid;
  }

  sendText(content: string) { return this.sendMessage('text', content); }
}

