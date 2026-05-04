export type MapMarkerType = 'origin' | 'destination' | 'waypoint' | 'vehicle';

export interface MapMarker {
  type: MapMarkerType;
  latitude: number;
  longitude: number;
  index?: number;
}

export interface MapBounds {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
}

export interface MapConfig {
  styles: {
    light: string;
    dark: string;
    satellite?: string;
  };
  default_center: { lat: number; lng: number };
  default_zoom: number;
  tile_url?: string;
  marker_colors?: Record<string, string>;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
  road?: string;
  area?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

export interface RouteStep {
  instruction: string;
  distance_km: number;
  duration_min: number;
  name?: string;
}

export interface GeoJSONLineString {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
}

export interface RouteResponse {
  distance_km: number;
  duration_min: number;
  duration_text: string;
  polyline: string;
  steps: RouteStep[];
  markers: MapMarker[];
  geojson: GeoJSONLineString;
}

export interface BookingRouteResponse extends RouteResponse {
  bounds?: MapBounds;
  vehicle?: {
    lat: number;
    lng: number;
    heading?: number;
  };
}

export interface NearbyTransporter {
  transporter_id: number;
  lat: number;
  lng: number;
  distance_km: number;
  speed_kmh?: number;
  heading?: number;
}

