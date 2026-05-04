'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { bookingService, mapService, getApiError } from '@speedygo/api-client';
import { GeocodeResult, RouteResponse } from '@speedygo/types';
import Map, { Marker, Source, Layer, NavigationControl, GeolocateControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

interface LatLng { lat: number; lng: number }

// ─── Debounced Search Hook ───
function useDebouncedSearch(delay = 350) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await mapService.geocode(q);
        setResults(res.results);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, delay);
  }, [delay]);

  return { query, search, results, loading, setResults };
}

// ─── Vehicle Data ───
const VEHICLES = [
  { id: '2wheeler', icon: 'two_wheeler', label: '2-Wheeler', weight: 'Up to 20 kg', maxKg: 20, pricePerKm: 8 },
  { id: '3wheeler', icon: 'electric_rickshaw', label: '3-Wheeler', weight: 'Up to 500 kg', maxKg: 500, pricePerKm: 20 },
  { id: 'van', icon: 'local_shipping', label: 'Small Van', weight: 'Up to 1.5 Tons', maxKg: 1500, pricePerKm: 45 },
  { id: 'truck', icon: 'fire_truck', label: 'Large Truck', weight: 'Up to 15 Tons', maxKg: 15000, pricePerKm: 120 },
];

export default function NewBookingPage() {
  const router = useRouter();

  // Map state
  const [mapStyle] = useState('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json');
  const [viewState, setViewState] = useState({ longitude: 77.5946, latitude: 12.9716, zoom: 12 });
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  // Source & destination
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupAddr, setPickupAddr] = useState('');
  const [drop, setDrop] = useState<LatLng | null>(null);
  const [dropAddr, setDropAddr] = useState('');
  const [selectingFor, setSelectingFor] = useState<'pickup' | 'drop' | null>(null);

  // Route
  const [route, setRoute] = useState<RouteResponse | null>(null);

  // Vehicle selection
  const [selectedVehicle, setSelectedVehicle] = useState<(typeof VEHICLES)[number]>(VEHICLES[1]!);

  // Booking form
  const [goodsDesc, setGoodsDesc] = useState('');
  const [goodsWeight, setGoodsWeight] = useState(50);
  const [fragile, setFragile] = useState(false);
  const [biddingEnabled, setBiddingEnabled] = useState(false);

  // UI state
  const [step, setStep] = useState<'location' | 'vehicle' | 'confirm'>('location');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationPermission, setLocationPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  // Search
  const pickupSearch = useDebouncedSearch();
  const dropSearch = useDebouncedSearch();

  // ─── Get user location on mount ───
  useEffect(() => {
    if (!navigator.geolocation) { setLocationPermission('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocationPermission('granted');
        setViewState({ longitude: loc.lng, latitude: loc.lat, zoom: 14 });
        // Auto-set pickup to current location
        if (!pickup) {
          setPickup(loc);
          try {
            const result = await mapService.reverseGeocode(loc.lat, loc.lng);
            setPickupAddr(result.display_name);
          } catch { setPickupAddr(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`); }
        }
      },
      () => setLocationPermission('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ─── Calculate route when both points are set ───
  useEffect(() => {
    if (!pickup || !drop) { setRoute(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await mapService.getRoute({ origin: pickup, destination: drop });
        setRoute(res);
      } catch { setRoute(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [pickup, drop]);

  // ─── Map click to select point ───
  const handleMapClick = useCallback(async (e: { lngLat: { lng: number; lat: number } }) => {
    if (!selectingFor) return;
    const loc = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    try {
      const result = await mapService.reverseGeocode(loc.lat, loc.lng);
      if (selectingFor === 'pickup') { setPickup(loc); setPickupAddr(result.display_name); }
      else { setDrop(loc); setDropAddr(result.display_name); }
    } catch {
      const addr = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
      if (selectingFor === 'pickup') { setPickup(loc); setPickupAddr(addr); }
      else { setDrop(loc); setDropAddr(addr); }
    }
    setSelectingFor(null);
  }, [selectingFor]);

  // ─── Refresh location ───
  const refreshLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setViewState({ longitude: loc.lng, latitude: loc.lat, zoom: 15 });
      },
      () => {}
    );
  };

  // ─── Select geocoded result ───
  const selectPickupResult = (r: GeocodeResult) => {
    setPickup({ lat: r.lat, lng: r.lng });
    setPickupAddr(r.display_name);
    pickupSearch.setResults([]);
    setViewState({ longitude: r.lng, latitude: r.lat, zoom: 14 });
  };
  const selectDropResult = (r: GeocodeResult) => {
    setDrop({ lat: r.lat, lng: r.lng });
    setDropAddr(r.display_name);
    dropSearch.setResults([]);
    setViewState({ longitude: r.lng, latitude: r.lat, zoom: 14 });
  };

  // ─── Estimated price ───
  const estimatedPrice = route ? Math.round(route.distance_km * selectedVehicle.pricePerKm * (fragile ? 1.15 : 1) * 100) : 0;

  // ─── Submit booking ───
  const submitBooking = async () => {
    if (!pickup || !drop) { setError('Select pickup and drop locations'); return; }
    setLoading(true); setError('');
    try {
      const booking = await bookingService.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickupAddr,
        drop_lat: drop.lat, drop_lng: drop.lng, drop_address: dropAddr,
        goods_description: goodsDesc, goods_weight_kg: goodsWeight,
        goods_fragile: fragile, bidding_enabled: biddingEnabled,
      });
      router.push(`/bookings/${booking.id}`);
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col md:flex-row">
      {/* ═══ MAP ═══ */}
      <div className="flex-1 relative">
        <Map
          {...viewState}
          onMove={(e) => setViewState(e.viewState)}
          onClick={handleMapClick}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          cursor={selectingFor ? 'crosshair' : 'grab'}
        >
          <NavigationControl position="bottom-right" />
          <GeolocateControl position="bottom-right" trackUserLocation />

          {/* Route line */}
          {route?.geojson && (
            <Source id="route" type="geojson" data={route.geojson as any}>
              <Layer id="route-line" type="line" paint={{ 'line-color': '#4cd7f6', 'line-width': 4, 'line-opacity': 0.8 }} />
            </Source>
          )}

          {/* Pickup marker */}
          {pickup && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.6)] border-2 border-white">
                  <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
                </div>
                <div className="w-0.5 h-3 bg-amber-500" />
              </div>
            </Marker>
          )}

          {/* Drop marker */}
          {drop && (
            <Marker longitude={drop.lng} latitude={drop.lat} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.6)] border-2 border-white">
                  <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                </div>
                <div className="w-0.5 h-3 bg-red-500" />
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

        {/* Map Controls Overlay */}
        <div className="absolute top-20 md:top-4 left-4 flex flex-col gap-2 z-10">
          <button onClick={refreshLocation} className="w-10 h-10 rounded-lg bg-surface-container/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-on-surface hover:bg-white/10 transition shadow-lg">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
          {selectingFor && (
            <div className="bg-tertiary/90 text-on-tertiary px-3 py-2 rounded-lg text-xs font-medium shadow-lg animate-pulse">
              Tap map to set {selectingFor}
            </div>
          )}
        </div>

        {/* Route info overlay */}
        {route && (
          <div className="absolute top-20 md:top-4 right-4 glass-panel rounded-xl px-4 py-3 z-10">
            <div className="text-xs text-on-surface-variant">Distance</div>
            <div className="text-lg font-bold text-tertiary">{route.distance_km.toFixed(1)} km</div>
            <div className="text-xs text-on-surface-variant mt-1">{route.duration_text}</div>
          </div>
        )}
      </div>

      {/* ═══ SIDE PANEL ═══ */}
      <div className="w-full md:w-[440px] md:h-full overflow-y-auto bg-surface-container/95 backdrop-blur-xl border-l border-white/10 z-20 flex flex-col">
        {/* Location permission warning */}
        {locationPermission === 'denied' && (
          <div className="mx-4 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-amber-400 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">location_off</span>
            Location access denied. Enable in browser settings for best experience.
          </div>
        )}

        {/* ─── Step: Location ─── */}
        {step === 'location' && (
          <div className="p-6 flex flex-col gap-5 flex-1">
            <h2 className="text-headline-md text-on-surface font-bold">Where to?</h2>

            {/* Pickup */}
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                <div className="flex-1 relative">
                  <input
                    value={pickupAddr}
                    onChange={(e) => { setPickupAddr(e.target.value); pickupSearch.search(e.target.value); }}
                    placeholder="Pickup location (current location)"
                    className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline pr-10"
                  />
                  <button onClick={() => setSelectingFor('pickup')} className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-tertiary">
                    <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                  </button>
                </div>
              </div>
              {pickupSearch.results.length > 0 && (
                <div className="absolute left-6 right-0 mt-1 glass-panel rounded-lg max-h-40 overflow-y-auto z-50">
                  {pickupSearch.results.map((r, i) => (
                    <button key={i} onClick={() => selectPickupResult(r)}
                      className="w-full text-left px-4 py-2.5 text-sm text-on-surface-variant hover:bg-white/5 hover:text-white border-b border-white/5 last:border-0 truncate">
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Route line */}
            <div className="ml-[5px] w-0.5 h-6 bg-outline-variant/30 border-dashed border-l border-white/20" />

            {/* Drop */}
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                <div className="flex-1 relative">
                  <input
                    value={dropAddr}
                    onChange={(e) => { setDropAddr(e.target.value); dropSearch.search(e.target.value); }}
                    placeholder="Drop-off location"
                    className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline pr-10"
                  />
                  <button onClick={() => setSelectingFor('drop')} className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-tertiary">
                    <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                  </button>
                </div>
              </div>
              {dropSearch.results.length > 0 && (
                <div className="absolute left-6 right-0 mt-1 glass-panel rounded-lg max-h-40 overflow-y-auto z-50">
                  {dropSearch.results.map((r, i) => (
                    <button key={i} onClick={() => selectDropResult(r)}
                      className="w-full text-left px-4 py-2.5 text-sm text-on-surface-variant hover:bg-white/5 hover:text-white border-b border-white/5 last:border-0 truncate">
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto pt-4">
              <button onClick={() => setStep('vehicle')} disabled={!pickup || !drop || !route}
                className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-4 rounded-xl text-lg flex items-center justify-center gap-2">
                Select Vehicle <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── Step: Vehicle Selection ─── */}
        {step === 'vehicle' && (
          <div className="p-6 flex flex-col gap-5 flex-1">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('location')} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="text-headline-md text-on-surface font-bold">Select Vehicle</h2>
            </div>

            {route && (
              <div className="flex items-center gap-2 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-tertiary text-[16px]">distance</span>
                {route.distance_km.toFixed(1)} km • {route.duration_text}
              </div>
            )}

            {/* Vehicle Cards - Carousel style */}
            <div className="flex flex-col gap-3 overflow-y-auto flex-1">
              {VEHICLES.map((v, idx) => {
                const isSelected = selectedVehicle.id === v.id;
                const price = route ? Math.round(route.distance_km * v.pricePerKm * (fragile ? 1.15 : 1)) : 0;
                return (
                  <button key={v.id} onClick={() => setSelectedVehicle(v)}
                    className={`relative rounded-xl p-4 flex items-center justify-between group text-left w-full transition-all duration-300 ${
                      isSelected
                        ? 'vehicle-card selected scale-[1.02]'
                        : 'vehicle-card hover:scale-[1.01]'
                    }`}
                    style={{
                      animationDelay: `${idx * 80}ms`,
                      animation: 'fadeInUp 0.4s ease-out forwards',
                    }}>
                    {/* Active glow effect */}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-tertiary/5 to-primary/5 animate-pulse pointer-events-none" />
                    )}
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                        isSelected
                          ? 'bg-tertiary/20 border-tertiary/40 shadow-[0_0_15px_rgba(76,215,246,0.3)] scale-110'
                          : 'bg-surface-container-highest border-outline-variant/30 group-hover:border-tertiary/30 group-hover:scale-105'
                      }`}>
                        <span className="material-symbols-outlined text-2xl text-primary transition-transform duration-300 group-hover:scale-110"
                          style={{ fontVariationSettings: "'FILL' 1" }}>{v.icon}</span>
                      </div>
                      <div>
                        <h3 className="text-on-surface font-semibold text-base">{v.label}</h3>
                        <p className="text-on-surface-variant text-sm flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">weight</span>{v.weight}
                        </p>
                        <p className="text-xs text-outline mt-0.5">Max {v.maxKg} kg</p>
                      </div>
                    </div>
                    <div className="text-right relative z-10">
                      <span className={`text-xl font-bold transition-colors duration-300 ${isSelected ? 'text-tertiary' : 'text-on-surface'}`}>
                        ₹{price.toLocaleString('en-IN')}
                      </span>
                      <div className={`text-xs mt-0.5 transition-all duration-300 ${isSelected ? 'text-tertiary opacity-100' : 'opacity-0'}`}>
                        ✓ Selected
                      </div>
                      {!isSelected && (
                        <div className="text-xs text-outline mt-0.5">₹{v.pricePerKm}/km</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected summary */}
            <div className="glass-panel rounded-xl p-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{selectedVehicle.icon}</span>
                <span className="text-on-surface font-medium">{selectedVehicle.label}</span>
              </div>
              <span className="text-tertiary font-bold">
                ₹{(route ? Math.round(route.distance_km * selectedVehicle.pricePerKm * (fragile ? 1.15 : 1)) : 0).toLocaleString('en-IN')}
              </span>
            </div>

            <button onClick={() => setStep('confirm')} className="w-full btn-3d text-white font-semibold py-4 rounded-xl text-lg flex items-center justify-center gap-2">
              Continue <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        )}

        {/* ─── Step: Confirm ─── */}
        {step === 'confirm' && (
          <div className="p-6 flex flex-col gap-5 flex-1">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('vehicle')} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="text-headline-md text-on-surface font-bold">Confirm Booking</h2>
            </div>

            {/* Route Summary */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-0.5 h-8 bg-outline-variant/30 my-1" />
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="text-xs text-on-surface-variant">PICKUP</div>
                    <div className="text-sm text-on-surface truncate">{pickupAddr}</div>
                  </div>
                  <div>
                    <div className="text-xs text-on-surface-variant">DROP</div>
                    <div className="text-sm text-on-surface truncate">{dropAddr}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle */}
            <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{selectedVehicle.icon}</span>
                <div>
                  <div className="text-on-surface font-medium">{selectedVehicle.label}</div>
                  <div className="text-xs text-on-surface-variant">{selectedVehicle.weight}</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-tertiary">₹{(estimatedPrice / 100).toLocaleString('en-IN')}</div>
            </div>

            {/* Goods */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <input value={goodsDesc} onChange={(e) => setGoodsDesc(e.target.value)} placeholder="Goods description (e.g. Electronics)"
                className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-on-surface-variant">Weight (kg)</label>
                  <input type="number" value={goodsWeight} onChange={(e) => setGoodsWeight(Number(e.target.value))} min={0.1} max={selectedVehicle.maxKg}
                    className="w-full glass-input rounded-lg px-3 py-2 text-sm text-on-surface mt-1" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface-variant self-end pb-2">
                  <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} className="accent-tertiary w-4 h-4" />
                  Fragile (+15%)
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface-variant">
                <input type="checkbox" checked={biddingEnabled} onChange={(e) => setBiddingEnabled(e.target.checked)} className="accent-tertiary w-4 h-4" />
                Enable bidding (transporters can bid)
              </label>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>
            )}

            <div className="mt-auto">
              <button onClick={submitBooking} disabled={loading}
                className="w-full btn-3d disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2">
                {loading ? (
                  <><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> Creating...</>
                ) : (
                  <>Confirm Booking <span className="material-symbols-outlined">check</span></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

