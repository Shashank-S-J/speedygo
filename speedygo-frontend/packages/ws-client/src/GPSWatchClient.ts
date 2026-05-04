import { WSManager } from './WSManager';
import { LocationUpdate } from '@speedygo/types';

const WS_BASE = (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_API_URL'] : null) ?? 'http://localhost:8080';
const WS_URL = WS_BASE.replace(/^http/, 'ws');

export class GPSWatchClient {
  private manager: WSManager;
  private locationHandlers: Set<(loc: LocationUpdate) => void> = new Set();

  constructor(bookingId: number, token: string) {
    const url = `${WS_URL}/track/watch/${bookingId}?token=${encodeURIComponent(token)}`;
    this.manager = new WSManager(url);

    this.manager.onMessage((raw) => {
      const data = raw as LocationUpdate & { error?: string };
      if (data.error) return;
      this.locationHandlers.forEach(h => h(data));
    });
  }

  connect() { this.manager.connect(); }
  disconnect() { this.manager.disconnect(); }
  isConnected() { return this.manager.isConnected(); }

  onLocationUpdate(handler: (loc: LocationUpdate) => void) {
    this.locationHandlers.add(handler);
    return () => this.locationHandlers.delete(handler);
  }

  onStatus(handler: (connected: boolean) => void) {
    return this.manager.onStatus(handler);
  }
}

