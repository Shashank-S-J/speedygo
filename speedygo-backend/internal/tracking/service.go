package tracking

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/speedygo/speedygo/internal/models"
	"gorm.io/gorm"
)

// Service handles real-time GPS tracking with Redis Geo.
type Service struct {
	rdb *redis.Client
	db  *gorm.DB
	log *slog.Logger
}

func NewService(rdb *redis.Client, db *gorm.DB, log *slog.Logger) *Service {
	return &Service{rdb: rdb, db: db, log: log}
}

// LocationUpdate represents a GPS position from a transporter.
type LocationUpdate struct {
	VehicleID uint    `json:"vehicle_id"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Speed     float64 `json:"speed_kmh"`
	Heading   float64 `json:"heading"`
	Timestamp int64   `json:"timestamp"`
}

// PublishLocation stores a GPS update in Redis Geo and publishes to watchers.
func (s *Service) PublishLocation(ctx context.Context, loc LocationUpdate) error {
	if s.rdb == nil {
		return nil
	}

	// Store in Redis Geo set for nearby queries
	s.rdb.GeoAdd(ctx, "vehicles:geo", &redis.GeoLocation{
		Name:      fmt.Sprintf("%d", loc.VehicleID),
		Longitude: loc.Lng,
		Latitude:  loc.Lat,
	})

	// Store latest position with TTL
	locJSON, _ := json.Marshal(loc)
	key := fmt.Sprintf("vehicle:loc:%d", loc.VehicleID)
	s.rdb.Set(ctx, key, locJSON, 5*time.Minute)

	// Publish to Redis PubSub for real-time watchers
	s.rdb.Publish(ctx, fmt.Sprintf("track:%d", loc.VehicleID), locJSON)

	// Update DB periodically (every 30s, not every ping)
	ttlKey := fmt.Sprintf("vehicle:dbsync:%d", loc.VehicleID)
	if s.rdb.Exists(ctx, ttlKey).Val() == 0 {
		now := time.Now()
		s.db.Model(&models.Vehicle{}).Where("id = ?", loc.VehicleID).Updates(map[string]interface{}{
			"current_lat":     loc.Lat,
			"current_lng":     loc.Lng,
			"last_gps_update": now,
		})

		// Update last_transporter_ping on all active bookings for this vehicle
		// (needed for ghost transporter detection scheduler)
		s.db.Model(&models.Booking{}).
			Where("vehicle_id = ? AND status IN ?", loc.VehicleID,
				[]string{string(models.BookingAccepted), string(models.BookingPickingUp), string(models.BookingInTransit)}).
			Update("last_transporter_ping", now)

		s.rdb.Set(ctx, ttlKey, "1", 30*time.Second)
	}

	return nil
}

// GetNearbyVehicles finds vehicles within a radius using Redis Geo.
func (s *Service) GetNearbyVehicles(ctx context.Context, lat, lng, radiusKm float64) ([]redis.GeoLocation, error) {
	if s.rdb == nil {
		return nil, nil
	}
	return s.rdb.GeoSearchLocation(ctx, "vehicles:geo", &redis.GeoSearchLocationQuery{
		GeoSearchQuery: redis.GeoSearchQuery{
			Longitude:  lng,
			Latitude:   lat,
			Radius:     radiusKm,
			RadiusUnit: "km",
			Sort:       "ASC",
			Count:      50,
		},
		WithCoord: true,
		WithDist:  true,
	}).Result()
}

// Handler manages tracking HTTP/WS endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// PublishWS handles transporter GPS publishing via WebSocket.
// WS /track/publish/:vehicleID
func (h *Handler) PublishWS() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		vehicleIDStr := c.Params("vehicleID")
		var vehicleID uint
		fmt.Sscanf(vehicleIDStr, "%d", &vehicleID)
		userID, _ := c.Locals("userID").(uint)

		// Verify vehicle ownership
		var v models.Vehicle
		if err := h.svc.db.First(&v, vehicleID).Error; err != nil || v.OwnerID != userID {
			c.WriteJSON(fiber.Map{"error": "Not vehicle owner or vehicle not found"})
			c.Close()
			return
		}

		h.svc.log.Info("tracking started", "vehicle_id", vehicleID, "user_id", userID)

		for {
			var loc LocationUpdate
			if err := c.ReadJSON(&loc); err != nil {
				break
			}
			loc.VehicleID = vehicleID
			if loc.Timestamp == 0 {
				loc.Timestamp = time.Now().Unix()
			}
			// Validate coordinates to prevent spoofed GPS data
			if loc.Lat < -90 || loc.Lat > 90 || loc.Lng < -180 || loc.Lng > 180 {
				c.WriteJSON(fiber.Map{"error": "Invalid coordinates"})
				continue
			}
			if loc.Lat == 0 && loc.Lng == 0 {
				continue // Skip null island
			}
			h.svc.PublishLocation(context.Background(), loc)
		}

		h.svc.log.Info("tracking stopped", "vehicle_id", vehicleID)
	})
}

// WatchWS handles customer watching a booking's vehicle via WebSocket.
// WS /track/watch/:bookingID
func (h *Handler) WatchWS() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		bookingIDStr := c.Params("bookingID")
		var bookingID uint
		fmt.Sscanf(bookingIDStr, "%d", &bookingID)
		userID, _ := c.Locals("userID").(uint)

		// Get booking to find vehicle
		var bk models.Booking
		if err := h.svc.db.First(&bk, bookingID).Error; err != nil {
			c.WriteJSON(fiber.Map{"error": "Booking not found"})
			c.Close()
			return
		}

		if bk.CustomerID != userID && (bk.TransporterID == nil || *bk.TransporterID != userID) {
			c.WriteJSON(fiber.Map{"error": "Not a participant"})
			c.Close()
			return
		}
		if bk.VehicleID == nil {
			c.WriteJSON(fiber.Map{"error": "No vehicle assigned yet"})
			c.Close()
			return
		}

		if h.svc.rdb == nil {
			c.WriteJSON(fiber.Map{"error": "Tracking not available"})
			c.Close()
			return
		}

		// Subscribe to Redis PubSub for this vehicle
		ctx := context.Background()
		channel := fmt.Sprintf("track:%d", *bk.VehicleID)
		sub := h.svc.rdb.Subscribe(ctx, channel)
		defer sub.Close()

		ch := sub.Channel()
		h.svc.log.Info("watcher connected", "booking_id", bookingID, "vehicle_id", *bk.VehicleID)

		// Send last known location immediately
		lastKey := fmt.Sprintf("vehicle:loc:%d", *bk.VehicleID)
		if lastLoc, err := h.svc.rdb.Get(ctx, lastKey).Result(); err == nil {
			c.WriteMessage(websocket.TextMessage, []byte(lastLoc))
		}

		// Forward location updates to WebSocket client
		for msg := range ch {
			if err := c.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				break
			}
		}
	})
}
