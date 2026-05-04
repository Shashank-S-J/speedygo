type MessageHandler = (data: unknown) => void;
type StatusHandler = (connected: boolean) => void;

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export class WSManager {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private lastConnectedAt: Date | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.retryCount = 0;
        this.lastConnectedAt = new Date();
        this.statusHandlers.forEach(h => h(true));
      };

      this.ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as unknown;
          this.messageHandlers.forEach(h => h(data));
        } catch {
          // ignore malformed JSON
        }
      };

      this.ws.onclose = () => {
        this.statusHandlers.forEach(h => h(false));
        if (this.shouldReconnect) this._scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      if (this.shouldReconnect) this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    const delay = BACKOFF_DELAYS[Math.min(this.retryCount, BACKOFF_DELAYS.length - 1)] ?? 30000;
    this.retryCount++;
    this.retryTimer = setTimeout(() => this._connect(), delay);
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'Normal closure');
    this.ws = null;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  getLastConnectedAt() {
    return this.lastConnectedAt;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

