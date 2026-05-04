package maps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─── OSRM Routing Service (Open Source Routing Machine) ───
// Uses the free, open-source OSRM for:
// - Route calculation between two points
// - ETA estimation
// - Route polyline (for map display)
// - Multi-stop routing (waypoints)
//
// Production: Self-host OSRM with local OSM data.
// Dev: Uses public demo endpoint (limited).

// RoutingService handles route calculation and ETA.
type RoutingService struct {
	baseURL    string
	httpClient *http.Client
	rdb        *redis.Client
}

// RoutePoint is a lat/lng coordinate for routing.
type RoutePoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// RouteResult contains the computed route details.
type RouteResult struct {
	DistanceKm   float64   `json:"distance_km"`
	DurationMin  float64   `json:"duration_min"`
	DurationText string    `json:"duration_text"`
	Polyline     string    `json:"polyline"` // Encoded polyline for map rendering
	Steps        []RouteStep `json:"steps,omitempty"`
	Waypoints    []RoutePoint `json:"waypoints,omitempty"`
}

// RouteStep is a single maneuver in the route.
type RouteStep struct {
	Instruction string  `json:"instruction"`
	DistanceKm  float64 `json:"distance_km"`
	DurationMin float64 `json:"duration_min"`
	Name        string  `json:"name"` // Road name
}

// osrmResponse is the raw OSRM API response.
type osrmResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Distance float64 `json:"distance"` // meters
		Duration float64 `json:"duration"` // seconds
		Geometry string  `json:"geometry"` // encoded polyline
		Legs     []struct {
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
			Steps    []struct {
				Distance float64 `json:"distance"`
				Duration float64 `json:"duration"`
				Name     string  `json:"name"`
				Maneuver struct {
					Instruction string `json:"instruction"`
					Type        string `json:"type"`
					Modifier    string `json:"modifier"`
				} `json:"maneuver"`
			} `json:"steps"`
		} `json:"legs"`
	} `json:"routes"`
	Waypoints []struct {
		Location []float64 `json:"location"` // [lng, lat]
		Name     string    `json:"name"`
	} `json:"waypoints"`
}

func NewRoutingService(osrmURL string, rdb *redis.Client) *RoutingService {
	if osrmURL == "" {
		osrmURL = "https://router.project-osrm.org"
	}
	return &RoutingService{
		baseURL: osrmURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		rdb: rdb,
	}
}

// GetRoute calculates the driving route between origin, optional waypoints, and destination.
func (r *RoutingService) GetRoute(ctx context.Context, origin, destination RoutePoint, waypoints []RoutePoint) (*RouteResult, error) {
	// Build cache key
	cacheKey := r.buildCacheKey(origin, destination, waypoints)
	if r.rdb != nil {
		if cached, err := r.rdb.Get(ctx, cacheKey).Result(); err == nil {
			var result RouteResult
			if json.Unmarshal([]byte(cached), &result) == nil {
				return &result, nil
			}
		}
	}

	// Build coordinates string: lng,lat;lng,lat;...
	points := make([]string, 0, len(waypoints)+2)
	points = append(points, fmt.Sprintf("%f,%f", origin.Lng, origin.Lat))
	for _, wp := range waypoints {
		points = append(points, fmt.Sprintf("%f,%f", wp.Lng, wp.Lat))
	}
	points = append(points, fmt.Sprintf("%f,%f", destination.Lng, destination.Lat))

	coords := strings.Join(points, ";")
	reqURL := fmt.Sprintf("%s/route/v1/driving/%s?overview=full&geometries=polyline&steps=true", r.baseURL, coords)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "SpeedyGo/1.0")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OSRM request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OSRM returned %d: %s", resp.StatusCode, string(body))
	}

	var osrm osrmResponse
	if err := json.Unmarshal(body, &osrm); err != nil {
		return nil, fmt.Errorf("parse OSRM response: %w", err)
	}

	if osrm.Code != "Ok" || len(osrm.Routes) == 0 {
		return nil, fmt.Errorf("OSRM could not find a route: %s", osrm.Code)
	}

	route := osrm.Routes[0]
	distanceKm := route.Distance / 1000.0
	durationMin := route.Duration / 60.0

	result := &RouteResult{
		DistanceKm:   distanceKm,
		DurationMin:  durationMin,
		DurationText: formatDuration(durationMin),
		Polyline:     route.Geometry,
	}

	// Extract steps
	for _, leg := range route.Legs {
		for _, step := range leg.Steps {
			instruction := step.Maneuver.Type
			if step.Maneuver.Modifier != "" {
				instruction += " " + step.Maneuver.Modifier
			}
			result.Steps = append(result.Steps, RouteStep{
				Instruction: instruction,
				DistanceKm:  step.Distance / 1000.0,
				DurationMin: step.Duration / 60.0,
				Name:        step.Name,
			})
		}
	}

	// Extract snapped waypoints
	for _, wp := range osrm.Waypoints {
		if len(wp.Location) >= 2 {
			result.Waypoints = append(result.Waypoints, RoutePoint{
				Lat: wp.Location[1],
				Lng: wp.Location[0],
			})
		}
	}

	// Cache route for 1 hour
	if r.rdb != nil {
		data, _ := json.Marshal(result)
		r.rdb.Set(ctx, cacheKey, data, 1*time.Hour)
	}

	return result, nil
}

// GetETA calculates just the estimated time of arrival.
func (r *RoutingService) GetETA(ctx context.Context, from, to RoutePoint) (float64, float64, error) {
	route, err := r.GetRoute(ctx, from, to, nil)
	if err != nil {
		return 0, 0, err
	}
	return route.DurationMin, route.DistanceKm, nil
}

func (r *RoutingService) buildCacheKey(origin, dest RoutePoint, waypoints []RoutePoint) string {
	key := fmt.Sprintf("route:%.4f,%.4f:%.4f,%.4f", origin.Lat, origin.Lng, dest.Lat, dest.Lng)
	for _, wp := range waypoints {
		key += fmt.Sprintf(":%.4f,%.4f", wp.Lat, wp.Lng)
	}
	return key
}

func formatDuration(minutes float64) string {
	if minutes < 60 {
		return fmt.Sprintf("%.0f min", minutes)
	}
	hours := int(minutes) / 60
	mins := int(minutes) % 60
	if mins == 0 {
		return fmt.Sprintf("%d hr", hours)
	}
	return fmt.Sprintf("%d hr %d min", hours, mins)
}

