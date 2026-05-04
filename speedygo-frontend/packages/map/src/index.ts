export const DEFAULT_DEV_MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(point: LatLng | null | undefined): point is LatLng {
  return !!point && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && !(point.lat === 0 && point.lng === 0);
}

export function toLngLat(point: LatLng): [number, number] {
  return [point.lng, point.lat];
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

