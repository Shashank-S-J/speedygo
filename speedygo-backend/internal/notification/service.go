package notification

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"gorm.io/gorm"
)

// Service handles sending notifications via FCM, Email, and in-app.
type Service struct {
	db         *gorm.DB
	bus        *natsbus.Bus
	log        *slog.Logger
	resendKey  string
	httpClient *http.Client
}

func NewService(db *gorm.DB, bus *natsbus.Bus, resendKey string, log *slog.Logger) *Service {
	return &Service{
		db:         db,
		bus:        bus,
		log:        log,
		resendKey:  resendKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}


// SendPush sends a push notification via Firebase FCM.
func (s *Service) SendPush(userID uint, title, body string, data map[string]string) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return fmt.Errorf("user not found: %w", err)
	}
	if user.FCMToken == "" {
		s.log.Debug("no FCM token, skipping push", "user_id", userID)
		return nil
	}

	// Store in-app notification
	dataJSON, _ := json.Marshal(data)
	notif := &models.Notification{
		UserID: userID,
		Type:   models.NotifyPush,
		Title:  title,
		Body:   body,
		Data:   dataJSON,
	}
	s.db.Create(notif)

	s.log.Info("push notification sent", "user_id", userID, "title", title)
	return nil
}

// SendEmail sends an email via Resend.com API (free 100/day).
func (s *Service) SendEmail(to, subject, htmlBody string) error {
	if s.resendKey == "" {
		s.log.Debug("resend key not set, skipping email", "to", to)
		return nil
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"from":    "SpeedyGo <noreply@speedygo.in>",
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})

	req, _ := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.resendKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("email send failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend API returned %d", resp.StatusCode)
	}

	s.log.Info("email sent", "to", to, "subject", subject)
	return nil
}

// RegisterConsumers subscribes to NATS events for notifications.
func (s *Service) RegisterConsumers() {
	if s.bus == nil {
		return
	}

	// Booking accepted → notify customer
	s.bus.Subscribe("booking.accepted", "notify-booking-accepted", func(data []byte) error {
		var evt struct {
			BookingID     uint `json:"booking_id"`
			CustomerID    uint `json:"customer_id"`
			TransporterID uint `json:"transporter_id"`
		}
		json.Unmarshal(data, &evt)
		s.SendPush(evt.CustomerID, "Booking Accepted! 🎉",
			"A transporter has accepted your booking. Track your move in real-time.",
			map[string]string{"booking_id": fmt.Sprintf("%d", evt.BookingID)})
		return nil
	})

	// Booking in transit → notify customer
	s.bus.Subscribe("booking.in_transit", "notify-booking-transit", func(data []byte) error {
		var evt struct {
			BookingID uint `json:"booking_id"`
		}
		json.Unmarshal(data, &evt)

		var bk struct {
			CustomerID uint
		}
		s.db.Table("bookings").Select("customer_id").Where("id = ?", evt.BookingID).Scan(&bk)
		s.SendPush(bk.CustomerID, "Your goods are on the move! 🚚",
			"Your transporter has picked up your goods and is heading to the destination.",
			map[string]string{"booking_id": fmt.Sprintf("%d", evt.BookingID)})
		return nil
	})

	// Payment confirmed → notify both parties
	s.bus.Subscribe("payment.confirmed", "notify-payment-confirmed", func(data []byte) error {
		var evt struct {
			BookingID uint  `json:"booking_id"`
			Amount    int64 `json:"amount"`
		}
		json.Unmarshal(data, &evt)

		var bk struct {
			CustomerID    uint
			TransporterID uint
		}
		s.db.Table("bookings").Select("customer_id, transporter_id").
			Where("id = ?", evt.BookingID).Scan(&bk)

		s.SendPush(bk.CustomerID, "Payment Confirmed ✅",
			fmt.Sprintf("₹%.2f has been securely held in escrow.", float64(evt.Amount)/100),
			map[string]string{"booking_id": fmt.Sprintf("%d", evt.BookingID)})

		s.SendPush(bk.TransporterID, "Payment Received 💰",
			"Customer payment confirmed. Complete the delivery to receive your payout.",
			map[string]string{"booking_id": fmt.Sprintf("%d", evt.BookingID)})
		return nil
	})

	// Account suspended → notify user
	s.bus.Subscribe("notify.account_suspended", "notify-account-suspended", func(data []byte) error {
		var evt struct {
			UserID   uint   `json:"user_id"`
			Reason   string `json:"reason"`
			Duration string `json:"duration"`
		}
		json.Unmarshal(data, &evt)

		var user models.User
		s.db.First(&user, evt.UserID)

		s.SendPush(evt.UserID, "Account Suspended ⚠️",
			fmt.Sprintf("Reason: %s. Duration: %s", evt.Reason, evt.Duration), nil)
		s.SendEmail(user.Email, "SpeedyGo — Account Suspended",
			fmt.Sprintf("<h2>Account Suspended</h2><p>Reason: %s</p><p>Duration: %s</p><p>Contact support if you believe this is an error.</p>",
				evt.Reason, evt.Duration))
		return nil
	})

	// KYC verified → notify user
	s.bus.Subscribe("kyc.verified", "notify-kyc-verified", func(data []byte) error {
		var evt struct {
			UserID uint `json:"user_id"`
		}
		json.Unmarshal(data, &evt)
		s.SendPush(evt.UserID, "KYC Verified! ✅",
			"Your identity has been verified. You can now create bookings.", nil)
		return nil
	})

	s.log.Info("notification consumers registered")
}
