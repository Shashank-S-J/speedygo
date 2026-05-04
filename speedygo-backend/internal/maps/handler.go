package maps

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// ─── Map Handler ───
// Exposes all map/location endpoints for customers, transporters, and admins.
// Uses OpenStreetMap + Nominatim (geocoding) + OSRM (routing).

// Handler manages map/location HTTP endpoints.
type Handler struct {
	geocoder *GeocodingService
	router   *RoutingService
	rdb      *redis.Client
	db       *gorm.DB
	log      *slog.Logger
}

func NewHandler(geocoder *GeocodingService, router *RoutingService, rdb *redis.Client, db *gorm.DB, log *slog.Logger) *Handler {
	return &Handler{geocoder: geocoder, router: router, rdb: rdb, db: db, log: log}
}

// ─── Map Configuration ───
// GET /map/config
// Returns mapcn/MapLibre GL compatible configuration.
// Frontend uses mapcn (https://github.com/AnmolSaini16/mapcn) with these settings.
//
// mapcn usage on frontend:
//   <Map styles={{ light: config.styles.light, dark: config.styles.dark }}
//        center={config.default_center} zoom={config.default_zoom}>
//     <MapControls showZoom showLocate showCompass showFullscreen />
//     <MapMarker longitude={pickup.lng} latitude={pickup.lat}>
//       <MarkerContent>...</MarkerContent>
//     </MapMarker>
//   </Map>
func (h *Handler) GetMapConfig(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		// MapLibre GL style specifications (used by mapcn's `styles` prop)
		"styles": fiber.Map{
			"light": "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
			"dark":  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
		},
		// Alternative free tile sources (if CARTO terms don't apply)
		"alternative_styles": fiber.Map{
			"osm_liberty": "https://tiles.openfreemap.org/styles/liberty",
			"osm_bright":  "https://tiles.openfreemap.org/styles/bright",
		},
		// Raster tile fallback (for non-vector rendering)
		"raster_tiles": fiber.Map{
			"osm":       "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
			"satellite": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		},
		"attribution": "© OpenStreetMap contributors, © CARTO",
		// Default viewport (mapcn uses [lng, lat] format for center)
		"default_center": []float64{77.5946, 12.9716}, // [lng, lat] Bangalore
		"default_zoom":   12,
		"min_zoom":       3,
		"max_zoom":       19,
		// MapControls config (maps to mapcn <MapControls> props)
		"controls": fiber.Map{
			"show_zoom":       true,
			"show_locate":     true,
			"show_compass":    true,
			"show_fullscreen": true,
			"position":        "bottom-right",
		},
		// Geocoding & routing availability
		"services": fiber.Map{
			"geocoding": true,
			"routing":   true,
			"tracking":  true,
		},
		// API endpoints for frontend to call
		"endpoints": fiber.Map{
			"geocode":          "/map/geocode",
			"reverse_geocode":  "/map/reverse-geocode",
			"route":            "/map/route",
			"eta":              "/map/eta/:bookingID",
			"update_location":  "/map/location",
			"nearby_transporters": "/map/transporters/nearby",
			"booking_route":    "/map/booking/:id/route",
			"track_publish_ws": "/track/publish/:vehicleID",
			"track_watch_ws":   "/track/watch/:bookingID",
		},
		// Location permission requirements
		// Frontend should request these permissions using navigator.geolocation API
		// and then call POST /map/location/permission to record the grant.
		"location": fiber.Map{
			"required":           true,
			"enable_high_accuracy": true,
			"maximum_age_ms":     30000,
			"timeout_ms":         10000,
			// For continuous tracking (transporter background GPS)
			"watch_options": fiber.Map{
				"interval_ms":         5000,
				"fastest_interval_ms": 3000,
				"distance_filter_m":   10,
			},
		},
		// Marker icons (frontend can use these with mapcn <MarkerContent>)
		"markers": fiber.Map{
			"customer_color":    "#3B82F6", // blue-500
			"transporter_color": "#10B981", // emerald-500
			"pickup_color":      "#F59E0B", // amber-500
			"drop_color":        "#EF4444", // red-500
			"waypoint_color":    "#8B5CF6", // violet-500
		},
		// Route styling (for mapcn route layer)
		"route_style": fiber.Map{
			"color":     "#3B82F6",
			"width":     4,
			"opacity":   0.8,
			"dash_array": []float64{},
		},
	})
}

// ─── Geocoding (Address Search) ───
// GET /map/geocode?q=<address>
// Forward geocoding: search for a place by name/address.
// Used in booking form for pickup/drop address autocomplete.
func (h *Handler) Geocode(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" || len(query) < 3 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Query must be at least 3 characters"})
	}
	if len(query) > 200 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Query too long"})
	}

	results, err := h.geocoder.ForwardGeocode(c.Context(), query)
	if err != nil {
		h.log.Error("geocoding failed", "query", query, "error", err)
		return c.Status(502).JSON(fiber.Map{"error": true, "message": "Geocoding service unavailable"})
	}

	return c.JSON(fiber.Map{"results": results, "count": len(results)})
}

// ─── Reverse Geocoding ───
// GET /map/reverse-geocode?lat=X&lng=Y
// Converts coordinates to address. Used when user taps on map or shares GPS location.
func (h *Handler) ReverseGeocode(c *fiber.Ctx) error {
	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(c.Query("lng"), 64)
	if err1 != nil || err2 != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Valid lat and lng required"})
	}
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Coordinates out of range"})
	}

	result, err := h.geocoder.ReverseGeocode(c.Context(), lat, lng)
	if err != nil {
		h.log.Error("reverse geocoding failed", "lat", lat, "lng", lng, "error", err)
		return c.Status(502).JSON(fiber.Map{"error": true, "message": "Geocoding service unavailable"})
	}

	return c.JSON(result)
}

// ─── Route Calculation ───
// POST /map/route
// Calculates driving route with ETA, distance, and encoded polyline.
// The polyline can be decoded on frontend for mapcn route rendering.
// Returns both raw polyline and GeoJSON for flexibility.
//
// mapcn frontend usage:
//   const route = await fetch('/map/route', { method: 'POST', body: JSON.stringify({...}) })
//   // Use route.geojson with MapLibre's addSource/addLayer for route line
//   // Or decode route.polyline with @mapbox/polyline for coordinates array
func (h *Handler) GetRoute(c *fiber.Ctx) error {
	var req struct {
		Origin      RoutePoint   `json:"origin"`
		Destination RoutePoint   `json:"destination"`
		Waypoints   []RoutePoint `json:"waypoints,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}

	if req.Origin.Lat == 0 || req.Origin.Lng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Origin coordinates required"})
	}
	if req.Destination.Lat == 0 || req.Destination.Lng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Destination coordinates required"})
	}
	if len(req.Waypoints) > 10 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Maximum 10 waypoints"})
	}

	route, err := h.router.GetRoute(c.Context(), req.Origin, req.Destination, req.Waypoints)
	if err != nil {
		h.log.Error("routing failed", "error", err)
		return c.Status(502).JSON(fiber.Map{"error": true, "message": "Routing service unavailable"})
	}

	// Build GeoJSON LineString from waypoints for direct use with MapLibre/mapcn
	coords := make([][]float64, 0, len(route.Waypoints))
	for _, wp := range route.Waypoints {
		coords = append(coords, []float64{wp.Lng, wp.Lat}) // GeoJSON = [lng, lat]
	}

	// Build marker array for mapcn <MapMarker> components
	markers := []fiber.Map{
		{"type": "origin", "longitude": req.Origin.Lng, "latitude": req.Origin.Lat},
	}
	for i, wp := range req.Waypoints {
		markers = append(markers, fiber.Map{
			"type": "waypoint", "index": i + 1,
			"longitude": wp.Lng, "latitude": wp.Lat,
		})
	}
	markers = append(markers, fiber.Map{
		"type": "destination", "longitude": req.Destination.Lng, "latitude": req.Destination.Lat,
	})

	return c.JSON(fiber.Map{
		"distance_km":   route.DistanceKm,
		"duration_min":  route.DurationMin,
		"duration_text": route.DurationText,
		"polyline":      route.Polyline, // Encoded polyline (decode with @mapbox/polyline)
		"steps":         route.Steps,
		"markers":       markers,
		// GeoJSON source for MapLibre addSource("route", { type: "geojson", data: geojson })
		"geojson": fiber.Map{
			"type": "Feature",
			"properties": fiber.Map{
				"distance_km":  route.DistanceKm,
				"duration_min": route.DurationMin,
			},
			"geometry": fiber.Map{
				"type":        "LineString",
				"coordinates": coords,
			},
		},
	})
}

// ─── Live ETA for Active Booking ───
// GET /map/eta/:bookingID
// Real-time ETA from transporter's current location to next stop.
func (h *Handler) GetLiveETA(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bookingID, err := strconv.ParseUint(c.Params("bookingID"), 10, 64)
	if err != nil || bookingID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	var bk models.Booking
	if err := h.db.First(&bk, bookingID).Error; err != nil {
		ae := apperr.NotFound("Booking not found")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	// Only participants can get ETA
	isParticipant := bk.CustomerID == userID || (bk.TransporterID != nil && *bk.TransporterID == userID)
	role, _ := c.Locals("role").(models.UserRole)
	isAdmin := role == models.RoleAdmin || role == models.RoleSuperAdmin
	if !isParticipant && !isAdmin {
		ae := apperr.Forbidden("Not a participant")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	if bk.VehicleID == nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "No vehicle assigned"})
	}

	// Get vehicle's current location from Redis
	var vehicleLat, vehicleLng float64
	if h.rdb != nil {
		locKey := fmt.Sprintf("vehicle:loc:%d", *bk.VehicleID)
		if locData, err := h.rdb.Get(c.Context(), locKey).Result(); err == nil {
			var loc struct {
				Lat float64 `json:"lat"`
				Lng float64 `json:"lng"`
			}
			if json.Unmarshal([]byte(locData), &loc) == nil {
				vehicleLat, vehicleLng = loc.Lat, loc.Lng
			}
		}
	}

	// Fallback to DB
	if vehicleLat == 0 && vehicleLng == 0 {
		var v models.Vehicle
		if h.db.First(&v, *bk.VehicleID).Error == nil {
			vehicleLat, vehicleLng = v.CurrentLat, v.CurrentLng
		}
	}

	if vehicleLat == 0 && vehicleLng == 0 {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle location not available"})
	}

	// Determine destination based on booking status
	var destLat, destLng float64
	var destLabel string
	switch bk.Status {
	case models.BookingAccepted, models.BookingPickingUp:
		destLat, destLng = bk.PickupLat, bk.PickupLng
		destLabel = "pickup"
	case models.BookingInTransit:
		destLat, destLng = bk.DropLat, bk.DropLng
		destLabel = "delivery"
	default:
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "ETA not available for this booking status"})
	}

	from := RoutePoint{Lat: vehicleLat, Lng: vehicleLng}
	to := RoutePoint{Lat: destLat, Lng: destLng}
	etaMin, distKm, err := h.router.GetETA(c.Context(), from, to)
	if err != nil {
		h.log.Error("ETA calculation failed", "error", err)
		return c.Status(502).JSON(fiber.Map{"error": true, "message": "ETA service unavailable"})
	}

	return c.JSON(fiber.Map{
		"booking_id":      bookingID,
		"eta_minutes":     etaMin,
		"eta_text":        formatDuration(etaMin),
		"distance_km":     distKm,
		"destination":     destLabel,
		"vehicle_lat":     vehicleLat,
		"vehicle_lng":     vehicleLng,
		"destination_lat": destLat,
		"destination_lng": destLng,
		"updated_at":      time.Now().UTC(),
	})
}

// ─── User Location Update ───
// PUT /map/location
// Stores user's current location. Used for:
// - Customer: finding nearby transporters during booking
// - Transporter: appearing in nearby searches, receiving relevant booking notifications
// - Admin: monitoring platform
func (h *Handler) UpdateUserLocation(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	role, _ := c.Locals("role").(models.UserRole)

	var req struct {
		Lat      float64 `json:"lat"`
		Lng      float64 `json:"lng"`
		Accuracy float64 `json:"accuracy_m"` // GPS accuracy in meters
		Speed    float64 `json:"speed_kmh,omitempty"`
		Heading  float64 `json:"heading,omitempty"`
		Source   string  `json:"source"` // "gps", "network", "manual"
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid coordinates"})
	}
	if req.Lat == 0 && req.Lng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Zero coordinates not accepted"})
	}

	if h.rdb == nil {
		return c.Status(503).JSON(fiber.Map{"error": true, "message": "Location service unavailable"})
	}

	ctx := context.Background()

	// Store in Redis with TTL (user locations expire after 15 min of no updates)
	locData, _ := json.Marshal(map[string]interface{}{
		"lat":      req.Lat,
		"lng":      req.Lng,
		"accuracy": req.Accuracy,
		"speed":    req.Speed,
		"heading":  req.Heading,
		"source":   req.Source,
		"role":     role,
		"time":     time.Now().Unix(),
	})
	userKey := fmt.Sprintf("user:loc:%d", userID)
	h.rdb.Set(ctx, userKey, locData, 15*time.Minute)

	// Add to Redis Geo set for nearby queries
	geoKey := "users:geo"
	if role == models.RoleTransporter {
		geoKey = "transporters:geo" // Separate geo index for transporters
	}
	h.rdb.GeoAdd(ctx, geoKey, &redis.GeoLocation{
		Name:      fmt.Sprintf("%d", userID),
		Longitude: req.Lng,
		Latitude:  req.Lat,
	})

	return c.JSON(fiber.Map{"ok": true})
}

// ─── Location Permission Grant ───
// POST /map/location/permission
// Records that a device has granted location permission.
// Used for analytics and to prompt user appropriately on next session.
func (h *Handler) RecordLocationPermission(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)

	var req struct {
		Granted    bool   `json:"granted"`
		Precise    bool   `json:"precise"`     // High accuracy
		Background bool   `json:"background"`  // Background location
		Platform   string `json:"platform"`    // "web", "android", "ios"
		DeviceID   string `json:"device_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}

	if h.rdb != nil {
		permKey := fmt.Sprintf("user:locperm:%d", userID)
		data, _ := json.Marshal(req)
		h.rdb.Set(context.Background(), permKey, data, 90*24*time.Hour) // 90 days
	}

	h.log.Info("location permission recorded",
		"user_id", userID,
		"granted", req.Granted,
		"precise", req.Precise,
		"background", req.Background,
		"platform", req.Platform,
	)

	return c.JSON(fiber.Map{"ok": true})
}

// ─── Get Nearby Transporters ───
// GET /map/transporters/nearby?lat=X&lng=Y&radius=Z
// Returns transporters near a location. Used during booking to show available drivers.
func (h *Handler) GetNearbyTransporters(c *fiber.Ctx) error {
	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(c.Query("lng"), 64)
	if err1 != nil || err2 != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "lat and lng required"})
	}
	radius, _ := strconv.ParseFloat(c.Query("radius", "10"), 64)
	if radius <= 0 || radius > 100 {
		radius = 10
	}

	if h.rdb == nil {
		return c.Status(503).JSON(fiber.Map{"error": true, "message": "Location service unavailable"})
	}

	ctx := context.Background()
	results, err := h.rdb.GeoSearchLocation(ctx, "transporters:geo", &redis.GeoSearchLocationQuery{
		GeoSearchQuery: redis.GeoSearchQuery{
			Longitude:  lng,
			Latitude:   lat,
			Radius:     radius,
			RadiusUnit: "km",
			Sort:       "ASC",
			Count:      50,
		},
		WithCoord: true,
		WithDist:  true,
	}).Result()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Search failed"})
	}

	transporters := make([]fiber.Map, 0, len(results))
	for _, r := range results {
		tID, _ := strconv.ParseUint(r.Name, 10, 64)
		entry := fiber.Map{
			"transporter_id": tID,
			"lat":            r.Latitude,
			"lng":            r.Longitude,
			"distance_km":    r.Dist,
		}
		// Enrich with speed/heading from detailed location data
		locKey := fmt.Sprintf("user:loc:%s", r.Name)
		if locData, err := h.rdb.Get(ctx, locKey).Result(); err == nil {
			var loc map[string]interface{}
			if json.Unmarshal([]byte(locData), &loc) == nil {
				if speed, ok := loc["speed"].(float64); ok {
					entry["speed_kmh"] = speed
				}
				if heading, ok := loc["heading"].(float64); ok {
					entry["heading"] = heading
				}
			}
		}
		transporters = append(transporters, entry)
	}

	return c.JSON(fiber.Map{
		"transporters": transporters,
		"count":        len(transporters),
		"search_radius_km": radius,
	})
}

// ─── Admin: Get All Active Booking Locations ───
// GET /map/admin/active-bookings
// Returns all active bookings with live vehicle positions as GeoJSON.
// Admin dashboard renders this with mapcn <Map> + <MapMarker> for each booking.
func (h *Handler) AdminGetActiveBookings(c *fiber.Ctx) error {
	var bookings []models.Booking
	h.db.Where("status IN ?", []string{
		string(models.BookingAccepted),
		string(models.BookingPickingUp),
		string(models.BookingInTransit),
	}).Find(&bookings)

	ctx := context.Background()

	// Build GeoJSON features for each booking
	features := make([]fiber.Map, 0, len(bookings)*2)
	markers := make([]fiber.Map, 0, len(bookings)*3)

	for _, b := range bookings {
		// Pickup marker
		markers = append(markers, fiber.Map{
			"type": "pickup", "booking_id": b.ID, "status": b.Status,
			"longitude": b.PickupLng, "latitude": b.PickupLat,
			"address": b.PickupAddress, "color": "#F59E0B",
		})
		// Drop marker
		markers = append(markers, fiber.Map{
			"type": "drop", "booking_id": b.ID, "status": b.Status,
			"longitude": b.DropLng, "latitude": b.DropLat,
			"address": b.DropAddress, "color": "#EF4444",
		})

		// Route line feature
		features = append(features, fiber.Map{
			"type": "Feature",
			"properties": fiber.Map{
				"booking_id": b.ID,
				"status":     b.Status,
				"type":       "route",
			},
			"geometry": fiber.Map{
				"type":        "LineString",
				"coordinates": [][]float64{{b.PickupLng, b.PickupLat}, {b.DropLng, b.DropLat}},
			},
		})

		// Live vehicle position
		if b.VehicleID != nil && h.rdb != nil {
			locKey := fmt.Sprintf("vehicle:loc:%d", *b.VehicleID)
			if locData, err := h.rdb.Get(ctx, locKey).Result(); err == nil {
				var loc map[string]interface{}
				if json.Unmarshal([]byte(locData), &loc) == nil {
					if lat, ok := loc["lat"].(float64); ok {
						if lng, ok := loc["lng"].(float64); ok && lat != 0 {
							markers = append(markers, fiber.Map{
								"type": "vehicle", "booking_id": b.ID, "status": b.Status,
								"longitude": lng, "latitude": lat,
								"heading": loc["heading"], "speed_kmh": loc["speed_kmh"],
								"color": "#10B981",
							})
						}
					}
				}
			}
		}
	}

	return c.JSON(fiber.Map{
		"markers": markers,
		"count":   len(bookings),
		"geojson": fiber.Map{
			"type":     "FeatureCollection",
			"features": features,
		},
	})
}

// ─── Booking Route Info ───
// GET /map/booking/:id/route
// Returns full route + markers for rendering a booking on mapcn map.
//
// mapcn usage:
//   <Map styles={config.styles} center={data.bounds.center} zoom={12}>
//     {data.markers.map(m => (
//       <MapMarker longitude={m.longitude} latitude={m.latitude}>
//         <MarkerContent><Pin color={m.color} /></MarkerContent>
//         <MarkerLabel>{m.label}</MarkerLabel>
//       </MapMarker>
//     ))}
//   </Map>
//   // Add route.geojson as a line layer via map ref
func (h *Handler) GetBookingRoute(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bookingID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || bookingID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	var bk models.Booking
	if err := h.db.Preload("Waypoints").First(&bk, bookingID).Error; err != nil {
		ae := apperr.NotFound("Booking not found")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	role, _ := c.Locals("role").(models.UserRole)
	isParticipant := bk.CustomerID == userID || (bk.TransporterID != nil && *bk.TransporterID == userID)
	isAdmin := role == models.RoleAdmin || role == models.RoleSuperAdmin
	if !isParticipant && !isAdmin {
		ae := apperr.Forbidden("Not a participant")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	origin := RoutePoint{Lat: bk.PickupLat, Lng: bk.PickupLng}
	dest := RoutePoint{Lat: bk.DropLat, Lng: bk.DropLng}

	var waypoints []RoutePoint
	for _, wp := range bk.Waypoints {
		waypoints = append(waypoints, RoutePoint{Lat: wp.Lat, Lng: wp.Lng})
	}

	route, err := h.router.GetRoute(c.Context(), origin, dest, waypoints)
	if err != nil {
		h.log.Error("booking route calculation failed", "booking_id", bookingID, "error", err)
		return c.Status(502).JSON(fiber.Map{"error": true, "message": "Routing service unavailable"})
	}

	// Build GeoJSON for MapLibre route layer
	coords := make([][]float64, 0, len(route.Waypoints))
	for _, wp := range route.Waypoints {
		coords = append(coords, []float64{wp.Lng, wp.Lat})
	}

	// Build mapcn-compatible markers array
	markers := []fiber.Map{
		{
			"type": "pickup", "label": "Pickup",
			"longitude": bk.PickupLng, "latitude": bk.PickupLat,
			"address": bk.PickupAddress, "color": "#F59E0B",
		},
	}
	for i, wp := range bk.Waypoints {
		markers = append(markers, fiber.Map{
			"type": "waypoint", "label": fmt.Sprintf("Stop %d", i+1),
			"longitude": wp.Lng, "latitude": wp.Lat,
			"address": wp.Address, "color": "#8B5CF6",
		})
	}
	markers = append(markers, fiber.Map{
		"type": "drop", "label": "Drop-off",
		"longitude": bk.DropLng, "latitude": bk.DropLat,
		"address": bk.DropAddress, "color": "#EF4444",
	})

	// Get live vehicle position if available
	var vehicleMarker fiber.Map
	if bk.VehicleID != nil && h.rdb != nil {
		locKey := fmt.Sprintf("vehicle:loc:%d", *bk.VehicleID)
		if locData, err := h.rdb.Get(c.Context(), locKey).Result(); err == nil {
			var loc struct {
				Lat     float64 `json:"lat"`
				Lng     float64 `json:"lng"`
				Heading float64 `json:"heading"`
				Speed   float64 `json:"speed_kmh"`
			}
			if json.Unmarshal([]byte(locData), &loc) == nil && loc.Lat != 0 {
				vehicleMarker = fiber.Map{
					"type": "vehicle", "label": "Transporter",
					"longitude": loc.Lng, "latitude": loc.Lat,
					"heading": loc.Heading, "speed_kmh": loc.Speed,
					"color": "#10B981",
				}
				markers = append(markers, vehicleMarker)
			}
		}
	}

	// Compute bounding box for map fitBounds
	allLngs := []float64{bk.PickupLng, bk.DropLng}
	allLats := []float64{bk.PickupLat, bk.DropLat}
	for _, wp := range bk.Waypoints {
		allLngs = append(allLngs, wp.Lng)
		allLats = append(allLats, wp.Lat)
	}
	minLng, maxLng := allLngs[0], allLngs[0]
	minLat, maxLat := allLats[0], allLats[0]
	for _, v := range allLngs {
		if v < minLng { minLng = v }
		if v > maxLng { maxLng = v }
	}
	for _, v := range allLats {
		if v < minLat { minLat = v }
		if v > maxLat { maxLat = v }
	}

	return c.JSON(fiber.Map{
		"booking_id":    bookingID,
		"status":        bk.Status,
		"distance_km":   route.DistanceKm,
		"duration_min":  route.DurationMin,
		"duration_text": route.DurationText,
		"polyline":      route.Polyline,
		"markers":       markers,
		// Bounding box for map.fitBounds([[sw], [ne]]) — [lng,lat] format
		"bounds": fiber.Map{
			"southwest": []float64{minLng - 0.01, minLat - 0.01},
			"northeast": []float64{maxLng + 0.01, maxLat + 0.01},
		},
		// GeoJSON for MapLibre addSource
		"geojson": fiber.Map{
			"type": "Feature",
			"properties": fiber.Map{
				"booking_id":  bookingID,
				"distance_km": route.DistanceKm,
				"duration_min": route.DurationMin,
			},
			"geometry": fiber.Map{
				"type":        "LineString",
				"coordinates": coords,
			},
		},
	})
}

