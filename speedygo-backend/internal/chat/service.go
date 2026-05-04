package chat

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Hub manages WebSocket connections per booking room.
type Hub struct {
	mu    sync.RWMutex
	rooms map[uint]map[uint]*websocket.Conn
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[uint]map[uint]*websocket.Conn)}
}

func (h *Hub) Register(bookingID, userID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[bookingID] == nil {
		h.rooms[bookingID] = make(map[uint]*websocket.Conn)
	}
	h.rooms[bookingID][userID] = conn
}

func (h *Hub) Unregister(bookingID, userID uint) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[bookingID]; ok {
		delete(room, userID)
		if len(room) == 0 {
			delete(h.rooms, bookingID)
		}
	}
}

func (h *Hub) Broadcast(bookingID uint, msg interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if room, ok := h.rooms[bookingID]; ok {
		for _, conn := range room {
			conn.WriteJSON(msg)
		}
	}
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) SaveMessage(msg *models.Message) error {
	hash := sha256.Sum256([]byte(msg.Content))
	msg.ContentHash = hex.EncodeToString(hash[:])
	return r.db.Create(msg).Error
}

func (r *Repository) IsDuplicate(clientUUID string) bool {
	var count int64
	r.db.Model(&models.Message{}).Where("client_uuid = ?", clientUUID).Count(&count)
	return count > 0
}

func (r *Repository) GetHistory(bookingID uint, limit, offset int) ([]models.Message, error) {
	var msgs []models.Message
	err := r.db.Where("booking_id = ?", bookingID).
		Order("created_at DESC").Limit(limit).Offset(offset).Find(&msgs).Error
	return msgs, err
}

// GetMessagesSince returns messages after a given timestamp (for reconnect replay).
func (r *Repository) GetMessagesSince(bookingID uint, since time.Time) ([]models.Message, error) {
	var msgs []models.Message
	err := r.db.Where("booking_id = ? AND created_at > ?", bookingID, since).
		Order("created_at ASC").Limit(200).Find(&msgs).Error
	return msgs, err
}

// chatAllowed checks booking state and enforces time windows.
// COMPLETED: 48h window. DISPUTED: read-only (no new messages).
func chatAllowed(bk *models.Booking) (allowed bool, readOnly bool) {
	switch bk.Status {
	case models.BookingAccepted, models.BookingPickingUp, models.BookingInTransit:
		return true, false
	case models.BookingCompleted:
		if bk.CompletedAt != nil && time.Since(*bk.CompletedAt) > 48*time.Hour {
			return false, false // Window closed
		}
		return true, false
	case models.BookingDisputed:
		return true, true // Read-only: can view but not send
	default:
		return false, false
	}
}

type Service struct {
	hub  *Hub
	repo *Repository
	bus  *natsbus.Bus
	log  *slog.Logger
	bdb  *gorm.DB
}

func NewService(repo *Repository, hub *Hub, bus *natsbus.Bus, bdb *gorm.DB, log *slog.Logger) *Service {
	return &Service{hub: hub, repo: repo, bus: bus, bdb: bdb, log: log}
}

type IncomingMessage struct {
	ClientUUID string `json:"client_uuid"`
	Type       string `json:"type"`
	Content    string `json:"content"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetHistory GET /chat/:bookingID/history
func (h *Handler) GetHistory(c *fiber.Ctx) error {
	bookingIDStr := c.Params("bookingID")
	var bid uint
	if _, err := fmt.Sscanf(bookingIDStr, "%d", &bid); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	userID, _ := c.Locals("userID").(uint)

	// Verify user is a participant of this booking
	var bk models.Booking
	if err := h.svc.bdb.First(&bk, bid).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Booking not found"})
	}
	if bk.CustomerID != userID && (bk.TransporterID == nil || *bk.TransporterID != userID) {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Not a participant of this booking"})
	}

	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	msgs, err := h.svc.repo.GetHistory(bid, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(msgs)
}

// WebSocketUpgrade is the WS handler for chat.
func (h *Handler) WebSocketUpgrade() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		var bookingID uint
		fmt.Sscanf(c.Params("bookingID"), "%d", &bookingID)
		userID, _ := c.Locals("userID").(uint)

		var bk models.Booking
		if err := h.svc.bdb.First(&bk, bookingID).Error; err != nil {
			c.WriteJSON(fiber.Map{"error": "Booking not found"})
			c.Close()
			return
		}

		allowed, readOnly := chatAllowed(&bk)
		if !allowed {
			c.WriteJSON(fiber.Map{"error": "Chat not available for this booking state"})
			c.Close()
			return
		}
		if bk.CustomerID != userID && (bk.TransporterID == nil || *bk.TransporterID != userID) {
			c.WriteJSON(fiber.Map{"error": "Not a participant"})
			c.Close()
			return
		}

		h.svc.hub.Register(bookingID, userID, c)
		defer h.svc.hub.Unregister(bookingID, userID)
		h.svc.log.Info("chat connected", "booking_id", bookingID, "user_id", userID, "read_only", readOnly)

		// Replay missed messages on reconnect if 'since' query param provided
		sinceParam := c.Query("since")
		if sinceParam != "" {
			if since, err := time.Parse(time.RFC3339, sinceParam); err == nil {
				missed, _ := h.svc.repo.GetMessagesSince(bookingID, since)
				for _, msg := range missed {
					c.WriteJSON(msg)
				}
			}
		}

		// If read-only (disputed), send history then keep connection alive for receiving only
		if readOnly {
			c.WriteJSON(fiber.Map{"info": "Chat is in read-only mode (booking disputed)"})
			// Keep connection open to receive broadcasts but reject writes
			for {
				var msg IncomingMessage
				if err := c.ReadJSON(&msg); err != nil {
					break
				}
				c.WriteJSON(fiber.Map{"error": "Chat is read-only during dispute"})
			}
			return
		}

		for {
			var msg IncomingMessage
			if err := c.ReadJSON(&msg); err != nil {
				break
			}

			// Re-check booking status on every message (state might have changed)
			var currentBk models.Booking
			if err := h.svc.bdb.First(&currentBk, bookingID).Error; err != nil {
				break
			}
			currentAllowed, currentReadOnly := chatAllowed(&currentBk)
			if !currentAllowed {
				c.WriteJSON(fiber.Map{"error": "Chat no longer available"})
				break
			}
			if currentReadOnly {
				c.WriteJSON(fiber.Map{"error": "Chat is now read-only"})
				continue
			}

			if h.svc.repo.IsDuplicate(msg.ClientUUID) {
				continue
			}
			saved := &models.Message{
				BookingID:  bookingID,
				SenderID:   userID,
				Type:       models.MessageType(msg.Type),
				Content:    msg.Content,
				ClientUUID: msg.ClientUUID,
				Status:     models.MsgSent,
			}
			if err := h.svc.repo.SaveMessage(saved); err != nil {
				h.svc.log.Error("save message failed", "error", err)
				continue
			}
			h.svc.hub.Broadcast(bookingID, saved)

			if h.svc.bus != nil {
				go h.svc.bus.Publish("chat.message", map[string]interface{}{
					"message_id": saved.ID, "booking_id": bookingID,
					"sender_id": userID, "content": msg.Content,
				})
			}
		}
	})
}
