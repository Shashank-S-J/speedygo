'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GPSWatchClient } from '@speedygo/ws-client';
import { useTrackingStore } from '@/store/trackingStore';
import { useAuthStore } from '@/store/authStore';
import { mapService, bookingService } from '@speedygo/api-client';
import { haversineMeters } from '@speedygo/map';
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function TrackPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { vehicleLocation, lastUpdatedAt, isConnected, setVehicleLocation, setConnected } = useTrackingStore();
  const clientRef = useRef<GPSWatchClient | null>(null);
  const [eta, setEta] = useState<{ eta_text: string; distance_km: number } | null>(null);
  const [noSignal, setNoSignal] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch booking details for route
  const { data: booking } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingService.getById(id),
    enabled: !Number.isNaN(id),
  });

  // Fetch route for display
  const { data: routeData } = useQuery({
    queryKey: ['booking-route', id],
    queryFn: () => mapService.getBookingRoute(id),
    enabled: !Number.isNaN(id),
  });

  // WebSocket connection
  useEffect(() => {
    const token = useAuthStore.getState().accessToken ?? '';
    const client = new GPSWatchClient(id, token);
    clientRef.current = client;
    const unsubMsg = client.onLocationUpdate((loc) => { setVehicleLocation(loc); setNoSignal(false); });
    const unsubStatus = client.onStatus(setConnected);
    client.connect();
    return () => { unsubMsg(); unsubStatus(); client.disconnect(); };
  }, [id]);

  // Background location tracking for user
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Detect signal loss
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastUpdatedAt && Date.now() - lastUpdatedAt.getTime() > 15_000) setNoSignal(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [lastUpdatedAt]);

  // Poll ETA every 30s
  useEffect(() => {
    const fetchEta = async () => {
      try { const res = await mapService.getEta(id); setEta(res); } catch { }
    };
    fetchEta();
    const t = setInterval(fetchEta, 30_000);
    return () => clearInterval(t);
  }, [id]);

  // Live distance from user to vehicle
  const liveDistanceKm = useMemo(() => {
    if (!userLocation || !vehicleLocation) return null;
    return haversineMeters(userLocation, vehicleLocation) / 1000;
  }, [userLocation, vehicleLocation]);

  // Map viewState
  const center = vehicleLocation
    ? { longitude: vehicleLocation.lng, latitude: vehicleLocation.lat }
    : booking
      ? { longitude: booking.pickup_lng, latitude: booking.pickup_lat }
      : { longitude: 77.5946, latitude: 12.9716 };

  const openGoogleMaps = () => {
    if (!booking) return;
    const dest = `${booking.drop_lat},${booking.drop_lng}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `google.navigation:q=${dest}`;
      setTimeout(() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank'), 500);
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-blur-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold text-on-surface">Live Tracking</h2>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {isConnected ? (
            <><span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" /><span className="text-tertiary">Live</span></>
          ) : (
            <><span className="w-2 h-2 rounded-full bg-outline" /><span className="text-outline">Connecting…</span></>
          )}
        </div>
      </div>

      {noSignal && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 text-amber-400 text-sm mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">signal_wifi_off</span>
          Driver signal lost — showing last known location
        </div>
      )}

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden relative border border-white/10">
        <Map
          initialViewState={{ ...center, zoom: 14 }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="bottom-right" />

          {/* Route line */}
          {routeData?.geojson && (
            <Source id="route" type="geojson" data={routeData.geojson as any}>
              <Layer id="route-line" type="line" paint={{ 'line-color': '#4cd7f6', 'line-width': 4, 'line-opacity': 0.8 }} />
            </Source>
          )}

          {/* Vehicle marker */}
          {vehicleLocation && (
            <Marker longitude={vehicleLocation.lng} latitude={vehicleLocation.lat}>
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.6)] border-2 border-white"
                style={{ transform: vehicleLocation.heading ? `rotate(${vehicleLocation.heading}deg)` : undefined }}>
                <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
              </div>
            </Marker>
          )}

          {/* Pickup marker */}
          {booking && (
            <Marker longitude={booking.pickup_lng} latitude={booking.pickup_lat}>
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center border-2 border-white shadow">
                <span className="material-symbols-outlined text-white text-[12px]">circle</span>
              </div>
            </Marker>
          )}

          {/* Drop marker */}
          {booking && (
            <Marker longitude={booking.drop_lng} latitude={booking.drop_lat}>
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center border-2 border-white shadow">
                <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
              </div>
            </Marker>
          )}

          {/* User location */}
          {userLocation && (
            <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
            </Marker>
          )}
        </Map>

        {/* Refresh location button */}
        <button onClick={() => navigator.geolocation.getCurrentPosition((p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }))}
          className="absolute top-4 left-4 w-10 h-10 rounded-lg bg-surface-container/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-on-surface hover:bg-white/10 transition shadow-lg z-10">
          <span className="material-symbols-outlined text-[18px]">refresh</span>
        </button>
      </div>

      {/* Bottom info panel */}
      <div className="mt-3 space-y-3">
        {/* ETA & Distance */}
        <div className="glass-panel rounded-xl p-4 flex justify-between items-center">
          <div>
            <div className="text-label-caps text-on-surface-variant">ETA</div>
            <div className="text-2xl font-bold text-white">{eta?.eta_text ?? '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-label-caps text-on-surface-variant">Distance</div>
            <div className="text-lg font-semibold text-tertiary">{eta?.distance_km?.toFixed(1) ?? '—'} km</div>
          </div>
          {liveDistanceKm !== null && (
            <div className="text-right">
              <div className="text-label-caps text-on-surface-variant">From You</div>
              <div className="text-lg font-semibold text-primary">{liveDistanceKm.toFixed(1)} km</div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={openGoogleMaps}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-semibold py-3 rounded-xl shadow-[0_3px_0_#064e3b] hover:translate-y-[1px] active:translate-y-[2px] transition-all text-sm">
            <span className="material-symbols-outlined text-[16px]">navigation</span> Navigate
          </button>
          <button onClick={() => router.push(`/bookings/${id}/chat`)}
            className="flex-1 flex items-center justify-center gap-2 bg-surface-container border border-outline-variant/30 text-on-surface font-semibold py-3 rounded-xl transition text-sm">
            <span className="material-symbols-outlined text-[16px]">chat</span> Chat
          </button>
          <button onClick={() => { if (confirm('Trigger SOS alert?')) { /* sosService.trigger */ } }}
            className="w-12 flex items-center justify-center bg-red-600/10 border border-red-500/30 text-red-400 py-3 rounded-xl transition">
            <span className="material-symbols-outlined text-[18px]">emergency</span>
          </button>
        </div>
      </div>
    </div>
  );
}
