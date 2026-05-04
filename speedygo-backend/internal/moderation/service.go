package moderation

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"

	"github.com/speedygo/speedygo/internal/aiadmin"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"gorm.io/gorm"
)

// Service handles content moderation, chat filtering, and automated actions based on AI scores.
type Service struct {
	db       *gorm.DB
	bus      *natsbus.Bus
	aiEngine *aiadmin.Engine
	log      *slog.Logger

	phoneRegex *regexp.Regexp
	urlRegex   *regexp.Regexp
}

func NewService(db *gorm.DB, bus *natsbus.Bus, aiEngine *aiadmin.Engine, log *slog.Logger) *Service {
	return &Service{
		db:         db,
		bus:        bus,
		aiEngine:   aiEngine,
		log:        log,
		phoneRegex: regexp.MustCompile(`(?i)(?:phone|call|whatsapp|wa\.me).*?(\+?\d[\d\-\s]{8,14}\d)`),
		urlRegex:   regexp.MustCompile(`(?i)(https?:\/\/[^\s]+)`),
	}
}

// RegisterConsumers subscribes to NATS events for automated moderation.
func (s *Service) RegisterConsumers() {
	if s.bus == nil {
		return
	}

	// 1. Moderate Chat Messages (PII masking and abuse detection)
	s.bus.Subscribe("chat.message", "moderate-chat", func(data []byte) error {
		var evt struct {
			MessageID string `json:"message_id"`
			BookingID uint   `json:"booking_id"`
			SenderID  uint   `json:"sender_id"`
			Content   string `json:"content"`
		}
		if err := json.Unmarshal(data, &evt); err != nil {
			return nil
		}

		s.moderateMessage(evt.MessageID, evt.SenderID, evt.Content)
		return nil
	})

	// 2. AI Triage for Reports
	s.bus.Subscribe("report.created", "triage-report", func(data []byte) error {
		var evt struct {
			ReportID    string `json:"report_id"`
			Category    string `json:"category"`
			Description string `json:"description"`
			ReporterID  uint   `json:"reporter_id"`
			ReportedID  uint   `json:"reported_id"`
		}
		if err := json.Unmarshal(data, &evt); err != nil {
			return nil
		}

		s.triageReport(evt.ReportID, evt.Category, evt.Description, evt.ReportedID)
		return nil
	})

	// 3. KYC Document AI Review
	s.bus.Subscribe("kyc.submitted", "ai-review-kyc", func(data []byte) error {
		var evt struct {
			KYCID     string `json:"kyc_id"`
			UserID    uint   `json:"user_id"`
			SessionID string `json:"session_id"`
		}
		json.Unmarshal(data, &evt)

		s.reviewKYC(evt.KYCID)
		return nil
	})

	s.log.Info("moderation consumers registered")
}

func (s *Service) moderateMessage(messageID string, senderID uint, content string) {
	flagged := false
	reason := ""

	// Check for phone numbers
	if s.phoneRegex.MatchString(content) {
		flagged = true
		reason = "Phone number sharing"
	}

	// Simple profanity check (placeholder for more robust solution)
	profanity := []string{"abuse", "scam", "kill", "threat", "idiot"} // Minimal list
	for _, p := range profanity {
		if regexp.MustCompile(fmt.Sprintf(`(?i)\b%s\b`, p)).MatchString(content) {
			flagged = true
			reason = "Inappropriate language"
			break
		}
	}

	if flagged {
		s.log.Warn("chat message flagged", "message_id", messageID, "reason", reason)
		
		s.db.Model(&models.Message{}).Where("id = ?", messageID).Updates(map[string]interface{}{
			"flagged":     true,
			"flag_reason": reason,
		})

		// Alert admin
		s.bus.Publish("notify.admin", map[string]interface{}{
			"type": "CHAT_FLAGGED",
			"message_id": messageID,
			"sender_id": senderID,
			"reason": reason,
		})
	}
}

func (s *Service) triageReport(reportID, category, description string, reportedID uint) {
	// Call AI Engine to analyze the report
	severity, tags, summary, err := s.aiEngine.AnalyzeReport(category, description, "No chat history provided")
	if err != nil {
		s.log.Error("failed to analyze report with AI", "error", err, "report_id", reportID)
		return
	}

	tagsJSON, _ := json.Marshal(tags)
	
	// Update report with AI analysis
	s.db.Model(&models.Report{}).Where("id = ?", reportID).Updates(map[string]interface{}{
		"status":      models.ReportUnderReview,
		"ai_severity": severity,
		"ai_tags":     tagsJSON,
		"admin_note":  "AI Summary: " + summary,
	})

	s.log.Info("report triaged", "report_id", reportID, "severity", severity)

	// High severity -> Auto Suspend action
	if severity >= 0.85 {
		s.log.Warn("high severity report, auto-suspending user", "reported_id", reportedID, "report_id", reportID)
		
		s.bus.Publish("admin.suspend_user", map[string]interface{}{
			"admin_id":  uint(0), // System
			"target_id": reportedID,
			"reason":    "Auto-suspended due to high-severity report: " + category,
			"duration":  "7d",
		})
	}
}

func (s *Service) reviewKYC(kycID string) {
	var kyc models.KYCVerification
	if err := s.db.First(&kyc, "id = ?", kycID).Error; err != nil {
		return
	}

	// Format doc URLs for AI
	var urls []string
	json.Unmarshal(kyc.DocURLs, &urls)

	docInfo := map[string]interface{}{
		"document_count": len(urls),
		"urls":           urls,
	}

	riskScore, flags, err := s.aiEngine.AnalyzeKYC(docInfo)
	if err != nil {
		s.log.Error("failed to analyze KYC with AI", "error", err, "kyc_id", kycID)
		return
	}

	flagsJSON, _ := json.Marshal(flags)
	s.db.Model(&models.KYCVerification{}).Where("id = ?", kycID).Updates(map[string]interface{}{
		"ai_risk_score": riskScore,
		"ai_flags":      flagsJSON,
	})
	
	s.log.Info("kyc reviewed by AI", "kyc_id", kycID, "risk_score", riskScore)

	// If very high risk, reject automatically (or send to manual review)
	if riskScore >= 0.90 {
		s.db.Model(&models.KYCVerification{}).Where("id = ?", kycID).Updates(map[string]interface{}{
			"status": models.KYCManualReview,
			"admin_note": "AI flagged high risk. Please review.",
		})
	}
}
