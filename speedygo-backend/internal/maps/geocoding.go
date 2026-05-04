package maps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─── Geocoding Service (OpenStreetMap Nominatim) ───
// Uses the free, open-source Nominatim API for:
// - Forward geocoding (address → lat/lng)
// - Reverse geocoding (lat/lng → address)
// - Autocomplete search for booking address selection
//
// Production: Self-host Nominatim for no rate limits.
// Dev: Uses public endpoint with 1 req/s rate limit.

// GeocodingService handles address↔coordinate conversion.
type GeocodingService struct {
	baseURL    string
	httpClient *http.Client
	rdb        *redis.Client
	log        *slog.Logger

	// Rate limiting for public Nominatim (1 req/s)
	mu         sync.Mutex
	lastReq    time.Time
}

// NominatimResult represents a single result from Nominatim.
type NominatimResult struct {
	PlaceID     int     `json:"place_id"`
	Lat         string  `json:"lat"`
	Lon         string  `json:"lon"`
	DisplayName string  `json:"display_name"`
	Type        string  `json:"type"`
	Importance  float64 `json:"importance"`
	Address     Address `json:"address"`
	BoundingBox []string `json:"boundingbox"` // [south, north, west, east]
}

// Address is the structured address from Nominatim.
type Address struct {
	Road        string `json:"road,omitempty"`
	Suburb      string `json:"suburb,omitempty"`
	City        string `json:"city,omitempty"`
	Town        string `json:"town,omitempty"`
	Village     string `json:"village,omitempty"`
	County      string `json:"county,omitempty"`
	State       string `json:"state,omitempty"`
	StateDistrict string `json:"state_district,omitempty"`
	Postcode    string `json:"postcode,omitempty"`
	Country     string `json:"country,omitempty"`
	CountryCode string `json:"country_code,omitempty"`
}

// GeocodedLocation is the standardized response.
type GeocodedLocation struct {
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	DisplayName  string  `json:"display_name"`
	Road         string  `json:"road,omitempty"`
	Area         string  `json:"area,omitempty"`
	City         string  `json:"city,omitempty"`
	State        string  `json:"state,omitempty"`
	Postcode     string  `json:"postcode,omitempty"`
	Country      string  `json:"country,omitempty"`
	CountryCode  string  `json:"country_code,omitempty"`
}

func NewGeocodingService(nominatimURL string, rdb *redis.Client, log *slog.Logger) *GeocodingService {
	if nominatimURL == "" {
		nominatimURL = "https://nominatim.openstreetmap.org"
	}
	return &GeocodingService{
		baseURL: nominatimURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		rdb: rdb,
		log: log,
	}
}

// throttle enforces 1 req/s for public Nominatim.
func (g *GeocodingService) throttle() {
	g.mu.Lock()
	defer g.mu.Unlock()
	elapsed := time.Since(g.lastReq)
	if elapsed < time.Second {
		time.Sleep(time.Second - elapsed)
	}
	g.lastReq = time.Now()
}

// ForwardGeocode converts an address string to coordinates.
func (g *GeocodingService) ForwardGeocode(ctx context.Context, query string) ([]GeocodedLocation, error) {
	// Check Redis cache first
	cacheKey := fmt.Sprintf("geo:fwd:%s", query)
	if g.rdb != nil {
		if cached, err := g.rdb.Get(ctx, cacheKey).Result(); err == nil {
			var results []GeocodedLocation
			if json.Unmarshal([]byte(cached), &results) == nil {
				return results, nil
			}
		}
	}

	g.throttle()

	params := url.Values{}
	params.Set("q", query)
	params.Set("format", "json")
	params.Set("addressdetails", "1")
	params.Set("limit", "5")
	params.Set("countrycodes", "in") // India focus, remove for global

	reqURL := fmt.Sprintf("%s/search?%s", g.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "SpeedyGo/1.0 (transport-platform)")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nominatim request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("nominatim returned %d: %s", resp.StatusCode, string(body))
	}

	var raw []NominatimResult
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	results := make([]GeocodedLocation, 0, len(raw))
	for _, r := range raw {
		lat, _ := strconv.ParseFloat(r.Lat, 64)
		lng, _ := strconv.ParseFloat(r.Lon, 64)
		results = append(results, GeocodedLocation{
			Lat:         lat,
			Lng:         lng,
			DisplayName: r.DisplayName,
			Road:        r.Address.Road,
			Area:        firstNonEmpty(r.Address.Suburb, r.Address.Village, r.Address.Town),
			City:        firstNonEmpty(r.Address.City, r.Address.Town, r.Address.Village),
			State:       r.Address.State,
			Postcode:    r.Address.Postcode,
			Country:     r.Address.Country,
			CountryCode: r.Address.CountryCode,
		})
	}

	// Cache for 24h
	if g.rdb != nil && len(results) > 0 {
		data, _ := json.Marshal(results)
		g.rdb.Set(ctx, cacheKey, data, 24*time.Hour)
	}

	return results, nil
}

// ReverseGeocode converts coordinates to a human-readable address.
func (g *GeocodingService) ReverseGeocode(ctx context.Context, lat, lng float64) (*GeocodedLocation, error) {
	cacheKey := fmt.Sprintf("geo:rev:%.5f:%.5f", lat, lng)
	if g.rdb != nil {
		if cached, err := g.rdb.Get(ctx, cacheKey).Result(); err == nil {
			var result GeocodedLocation
			if json.Unmarshal([]byte(cached), &result) == nil {
				return &result, nil
			}
		}
	}

	g.throttle()

	params := url.Values{}
	params.Set("lat", fmt.Sprintf("%f", lat))
	params.Set("lon", fmt.Sprintf("%f", lng))
	params.Set("format", "json")
	params.Set("addressdetails", "1")
	params.Set("zoom", "18") // Street-level detail

	reqURL := fmt.Sprintf("%s/reverse?%s", g.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "SpeedyGo/1.0 (transport-platform)")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nominatim request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("nominatim returned %d: %s", resp.StatusCode, string(body))
	}

	var raw NominatimResult
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	parsedLat, _ := strconv.ParseFloat(raw.Lat, 64)
	parsedLng, _ := strconv.ParseFloat(raw.Lon, 64)
	result := &GeocodedLocation{
		Lat:         parsedLat,
		Lng:         parsedLng,
		DisplayName: raw.DisplayName,
		Road:        raw.Address.Road,
		Area:        firstNonEmpty(raw.Address.Suburb, raw.Address.Village, raw.Address.Town),
		City:        firstNonEmpty(raw.Address.City, raw.Address.Town, raw.Address.Village),
		State:       raw.Address.State,
		Postcode:    raw.Address.Postcode,
		Country:     raw.Address.Country,
		CountryCode: raw.Address.CountryCode,
	}

	if g.rdb != nil {
		data, _ := json.Marshal(result)
		g.rdb.Set(ctx, cacheKey, data, 24*time.Hour)
	}

	return result, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

