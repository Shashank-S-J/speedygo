'use client';

import { useEffect, useRef } from 'react';

interface Props { lat: number; lng: number; heading?: number }

export default function TrackMap({ lat, lng, heading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Dynamically import maplibre to avoid SSR issues
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (mapRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [lng, lat],
        zoom: 14,
      });
      const marker = new maplibregl.Marker({ color: '#f97316' })
        .setLngLat([lng, lat])
        .addTo(map);
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      import('maplibre-gl').then(({ default: maplibregl }) => {
        (markerRef.current as InstanceType<typeof maplibregl.Marker>).setLngLat([lng, lat]);
        (mapRef.current as InstanceType<typeof maplibregl.Map>).panTo([lng, lat]);
      });
    }
  }, [lat, lng]);

  return <div ref={containerRef} className="w-full h-full" />;
}

