import { WSManager } from './WSManager';
import { GPSPublishPayload } from '@speedygo/types';

const WS_BASE = (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_API_URL'] : null) ?? 'http://localhost:8080';
const WS_URL = WS_BASE.replace(/^http/, 'ws');

export class GPSPublishClient {
  private manager: WSManager;
  private watchId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPosition: GeolocationPosition | null = null;

  constructor(vehicleId: number, token: string) {
    const url = `${WS_URL}/track/publish/${vehicleId}?token=${encodeURIComponent(token)}`;
    this.manager = new WSManager(url);
  }

  connect() { this.manager.connect(); }

  startPublishing(intervalMs = 4000) {
    this.manager.connect();

    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => { this.lastPosition = pos; },
      () => { /* permission denied or error */ },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    this.intervalId = setInterval(() => {
      if (!this.lastPosition) return;
      const { latitude: lat, longitude: lng, speed, heading } = this.lastPosition.coords;
      if (lat === 0 && lng === 0) return; // drop invalid
      const payload: GPSPublishPayload = {
        lat, lng,
        speed_kmh: speed != null ? speed * 3.6 : undefined,
        heading: heading ?? undefined,
        timestamp: Math.floor(Date.now() / 1000),
      };
      this.manager.send(payload);
    }, intervalMs);
  }

  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    if (this.intervalId != null) clearInterval(this.intervalId);
    this.manager.disconnect();
  }

  onStatus(handler: (connected: boolean) => void) {
    return this.manager.onStatus(handler);
  }
}

