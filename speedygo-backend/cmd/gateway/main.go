package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"github.com/speedygo/speedygo/internal/admin"
	"github.com/speedygo/speedygo/internal/aiadmin"
	"github.com/speedygo/speedygo/internal/bidding"
	"github.com/speedygo/speedygo/internal/booking"
	"github.com/speedygo/speedygo/internal/chat"
	"github.com/speedygo/speedygo/internal/config"
	"github.com/speedygo/speedygo/internal/dashboard"
	"github.com/speedygo/speedygo/internal/database"
	"github.com/speedygo/speedygo/internal/kyc"
	"github.com/speedygo/speedygo/internal/logger"
	"github.com/speedygo/speedygo/internal/maps"
	mw "github.com/speedygo/speedygo/internal/middleware"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/moderation"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/speedygo/speedygo/internal/notification"
	"github.com/speedygo/speedygo/internal/otp"
	"github.com/speedygo/speedygo/internal/payment"
	redisclient "github.com/speedygo/speedygo/internal/redisclient"
	"github.com/speedygo/speedygo/internal/report"
	"github.com/speedygo/speedygo/internal/scheduler"
	"github.com/speedygo/speedygo/internal/sos"
	"github.com/speedygo/speedygo/internal/tracking"
	"github.com/speedygo/speedygo/internal/user"
	"github.com/speedygo/speedygo/internal/vehicle"
)

func main() {
	cfg := config.Load()
	slog := logger.New(cfg.Server.Environment)
	slog = logger.WithService(slog, "gateway")

	slog.Info("SpeedyGo API Gateway starting",
		"port", cfg.Server.Port,
		"env", cfg.Server.Environment,
	)

	// ─── Infrastructure ───

	db, err := database.New(cfg.Database, slog)
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	if err := database.AutoMigrate(db, models.AllModels()...); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
	slog.Info("database migrations complete")

	rdb, err := redisclient.New(cfg.Redis, slog)
	if err != nil {
		slog.Error("Redis not available — security-critical operations (auth, token blacklist) will fail closed", "error", err)
		if cfg.Server.Environment != "development" {
			log.Fatalf("Redis is REQUIRED in %s environment for security operations", cfg.Server.Environment)
		}
	}

	var bus *natsbus.Bus
	bus, err = natsbus.New(cfg.NATS.URL, slog)
	if err != nil {
		slog.Warn("NATS not available", "error", err)
	} else {
		bus.EnsureStream("BOOKING", []string{"booking.>"})
		bus.EnsureStream("PAYMENT", []string{"payment.>"})
		bus.EnsureStream("KYC", []string{"kyc.>"})
		bus.EnsureStream("CHAT", []string{"chat.>"})
		bus.EnsureStream("REPORT", []string{"report.>"})
		bus.EnsureStream("NOTIFY", []string{"notify.>"})
	}

	// ─── Fiber App ───

	app := fiber.New(fiber.Config{
		ErrorHandler: mw.ErrorHandler,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		AppName:      "SpeedyGo Gateway",
	})

	app.Use(mw.Recover(slog))
	app.Use(mw.RequestID())
	app.Use(mw.Logger(slog))

	// CORS: in development allow all origins; in production set CORS_ORIGINS env var
	// e.g. CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
	corsOrigins := strings.Split(os.Getenv("CORS_ORIGINS"), ",")
	if len(corsOrigins) == 1 && corsOrigins[0] == "" {
		// Default: allow all in development
		corsOrigins = []string{"*"}
	}
	app.Use(mw.CORS(corsOrigins...))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok", "service": "speedygo-gateway", "time": time.Now().UTC(),
		})
	})

	// ─── Services ───

	// OTP Service (email-based, uses Resend free tier)
	resendKey := os.Getenv("RESEND_API_KEY")
	resendFromEmail := os.Getenv("RESEND_FROM_EMAIL")
	if resendFromEmail == "" {
		resendFromEmail = "SpeedyGo <noreply@speedygo.in>"
	}
	otpSvc := otp.NewService(rdb, resendKey, resendFromEmail, slog)

	userRepo := user.NewRepository(db)
	userSvc := user.NewService(userRepo, cfg, rdb, otpSvc, slog)
	userHandler := user.NewHandler(userSvc, cfg)

	bookingRepo := booking.NewRepository(db)
	bookingSvc := booking.NewService(bookingRepo, bus, rdb, otpSvc, slog)
	bookingHandler := booking.NewHandler(bookingSvc)

	vehicleRepo := vehicle.NewRepository(db)
	vehicleHandler := vehicle.NewHandler(vehicleRepo, slog)

	paymentRepo := payment.NewRepository(db)
	paymentSvc := payment.NewService(paymentRepo, bus, slog)
	paymentHandler := payment.NewHandler(paymentSvc, cfg)

	kycRepo := kyc.NewRepository(db)
	diditClient := kyc.NewDiditClient(cfg.KYC)
	kycSvc := kyc.NewService(kycRepo, diditClient, bus, db, slog)
	kycHandler := kyc.NewHandler(kycSvc)

	chatHub := chat.NewHub()
	chatRepo := chat.NewRepository(db)
	chatSvc := chat.NewService(chatRepo, chatHub, bus, db, slog)
	chatHandler := chat.NewHandler(chatSvc)

	reportRepo := report.NewRepository(db)
	reportSvc := report.NewService(reportRepo, bus, slog)
	reportHandler := report.NewHandler(reportSvc)

	adminSvc := admin.NewService(db, rdb, bus, slog)
	adminHandler := admin.NewHandler(adminSvc)

	// AI Admin Engine
	aiEngine := aiadmin.NewEngine(db, cfg.AI, slog)
	aiHandler := aiadmin.NewHandler(aiEngine)

	// Tracking Service
	trackingSvc := tracking.NewService(rdb, db, slog)
	trackingHandler := tracking.NewHandler(trackingSvc)

	// Notification Service (NATS consumers)
	notifSvc := notification.NewService(db, bus, resendKey, resendFromEmail, slog)
	notifSvc.RegisterConsumers()

	// Moderation Service
	modSvc := moderation.NewService(db, bus, aiEngine, slog)
	modSvc.RegisterConsumers()

	// SOS Service
	sosRepo := sos.NewRepository(db)
	sosSvc := sos.NewService(sosRepo, bus, db, slog)
	sosHandler := sos.NewHandler(sosSvc)

	// Bidding Service
	biddingRepo := bidding.NewRepository(db)
	biddingSvc := bidding.NewService(biddingRepo, bus, db, slog)
	biddingHandler := bidding.NewHandler(biddingSvc)

	// Map Services (OpenStreetMap + Nominatim + OSRM)
	geocoder := maps.NewGeocodingService(cfg.Map.NominatimURL, rdb, slog)
	routingSvc := maps.NewRoutingService(cfg.Map.OSRMURL, rdb)
	mapHandler := maps.NewHandler(geocoder, routingSvc, rdb, db, slog)

	// Dashboard Service
	dashSvc := dashboard.NewService(db, rdb, slog)
	dashHandler := dashboard.NewHandler(dashSvc)

	// Scheduler (background cron jobs)
	sched := scheduler.New(db, rdb, bus, slog)
	sched.Start()

	// ─── Routes ───

	// Auth (public)
	auth := app.Group("/auth")
	auth.Post("/register", mw.RateLimiter(rdb, 5, time.Minute), userHandler.Register)
	auth.Post("/verify-otp", mw.RateLimiter(rdb, 10, time.Minute), userHandler.VerifyRegistrationOTP)
	auth.Post("/resend-otp", mw.RateLimiter(rdb, 3, time.Minute), userHandler.ResendOTP)
	auth.Post("/login", mw.RateLimiter(rdb, 10, time.Minute), userHandler.Login)
	auth.Post("/login-otp", mw.RateLimiter(rdb, 5, time.Minute), userHandler.SendLoginOTP)
	auth.Post("/refresh", mw.RateLimiter(rdb, 20, time.Minute), userHandler.RefreshToken)
	auth.Post("/forgot-password", mw.RateLimiter(rdb, 3, time.Minute), userHandler.ForgotPassword)
	auth.Post("/reset-password", mw.RateLimiter(rdb, 5, time.Minute), userHandler.ResetPassword)
	// Logout does NOT require valid access token — allows logout with expired tokens
	// by accepting refresh_token in body for blacklisting. If access token is present
	// and valid, it will also be blacklisted.
	auth.Post("/logout", mw.RateLimiter(rdb, 10, time.Minute), mw.OptionalJWTAuth(cfg.JWT.Secret, rdb), userHandler.Logout)

	// Users (authenticated)
	users := app.Group("/users", mw.JWTAuth(cfg.JWT.Secret, rdb))
	users.Get("/me/profile", userHandler.GetProfile)
	users.Put("/me/profile", userHandler.UpdateProfile)
	users.Put("/me/password", userHandler.ChangePassword)
	users.Post("/me/password/send-otp", userHandler.SendChangePasswordOTP)
	users.Put("/me/password/verify-otp", userHandler.ChangePasswordWithOTP)
	users.Post("/me/photo", userHandler.UploadProfilePhoto)
	users.Get("/me/dashboard", dashHandler.GetMyDashboard)
	users.Get("/me/earnings", mw.RequireRole(models.RoleTransporter), dashHandler.GetFilteredEarnings)

	// Serve uploaded files (avatars, etc.)
	app.Static("/uploads", "./uploads")

	// KYC
	kycGroup := app.Group("/kyc", mw.JWTAuth(cfg.JWT.Secret, rdb))
	kycGroup.Post("/submit", kycHandler.SubmitKYC)
	kycGroup.Get("/status", kycHandler.GetKYCStatus)

	// Bookings
	bookings := app.Group("/bookings", mw.JWTAuth(cfg.JWT.Secret, rdb))
	bookings.Post("/", bookingHandler.CreateBooking)
	bookings.Get("/my", bookingHandler.GetMyBookings)
	bookings.Get("/nearby", mw.RequireRole(models.RoleTransporter), bookingHandler.GetNearbyBookings)
	bookings.Post("/estimate", bookingHandler.GetPriceEstimate)
	bookings.Put("/availability", mw.RequireRole(models.RoleTransporter), bookingHandler.SetAvailability)
	bookings.Put("/bids/:bidID/accept", biddingHandler.AcceptBid)
	bookings.Get("/:id", bookingHandler.GetBooking)
	bookings.Put("/:id/status", bookingHandler.UpdateStatus)
	bookings.Put("/:id/accept", mw.RequireRole(models.RoleTransporter), bookingHandler.AcceptBooking)
	bookings.Put("/:id/mismatch", mw.RequireRole(models.RoleTransporter), bookingHandler.FlagGoodsMismatch)
	bookings.Post("/:id/photos", bookingHandler.UploadPhotos)
	bookings.Post("/:id/send-otp", bookingHandler.SendBookingOTP)
	bookings.Post("/:id/verify-otp", bookingHandler.VerifyBookingOTP)
	bookings.Post("/:id/verify-pickup-otp", mw.RequireRole(models.RoleTransporter), bookingHandler.VerifyPickupOTP)
	bookings.Post("/:id/complete", mw.RequireRole(models.RoleTransporter), bookingHandler.CompleteBooking)
	bookings.Post("/:id/rate", dashHandler.RateBooking)
	// Bidding on bookings
	bookings.Post("/:id/bids", mw.RequireRole(models.RoleTransporter), biddingHandler.PlaceBid)
	bookings.Get("/:id/bids", biddingHandler.GetBids)

	// Vehicles
	vehicles := app.Group("/vehicles", mw.JWTAuth(cfg.JWT.Secret, rdb))
	vehicles.Post("/", mw.RequireRole(models.RoleTransporter), vehicleHandler.RegisterVehicle)
	vehicles.Get("/my", mw.RequireRole(models.RoleTransporter), vehicleHandler.GetMyVehicles)
	vehicles.Get("/nearby", vehicleHandler.SearchNearby)
	vehicles.Get("/search", vehicleHandler.SearchVehicles)
	vehicles.Put("/:id/location", mw.RequireRole(models.RoleTransporter), vehicleHandler.UpdateLocation)
	vehicles.Put("/:id", mw.RequireRole(models.RoleTransporter), vehicleHandler.UpdateVehicle)
	vehicles.Delete("/:id", mw.RequireRole(models.RoleTransporter), vehicleHandler.DeleteVehicle)
	vehicles.Get("/:id", vehicleHandler.GetVehicle)

	// Pricing (public)
	app.Get("/pricing", vehicleHandler.GetPublicPricing)

	// Payments
	payments := app.Group("/payments")
	payments.Post("/initiate", mw.JWTAuth(cfg.JWT.Secret, rdb), paymentHandler.InitiatePayment)
	payments.Post("/webhook", paymentHandler.StripeWebhook)

	// Chat
	chatGroup := app.Group("/chat", mw.JWTAuth(cfg.JWT.Secret, rdb))
	chatGroup.Get("/:bookingID/history", chatHandler.GetHistory)
	chatGroup.Use("/:bookingID", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	chatGroup.Get("/:bookingID", chatHandler.WebSocketUpgrade())

	// Reports
	reports := app.Group("/reports", mw.JWTAuth(cfg.JWT.Secret, rdb))
	reports.Post("/", reportHandler.CreateReport)

	// SOS
	sosGroup := app.Group("/sos", mw.JWTAuth(cfg.JWT.Secret, rdb))
	sosGroup.Post("/trigger", sosHandler.TriggerSOS)
	sosGroup.Post("/contacts", sosHandler.SetEmergencyContacts)
	sosGroup.Get("/contacts", sosHandler.GetEmergencyContacts)

	// Tracking
	trackGroup := app.Group("/track", mw.JWTAuth(cfg.JWT.Secret, rdb))
	trackGroup.Use("/publish/:vehicleID", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	trackGroup.Get("/publish/:vehicleID", trackingHandler.PublishWS())
	trackGroup.Use("/watch/:bookingID", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	trackGroup.Get("/watch/:bookingID", trackingHandler.WatchWS())

	// Map & Location (all roles)
	mapGroup := app.Group("/map")
	mapGroup.Get("/config", mapHandler.GetMapConfig) // Public — no auth needed for tile URLs
	mapAuth := mapGroup.Group("", mw.JWTAuth(cfg.JWT.Secret, rdb))
	mapAuth.Get("/geocode", mw.RateLimiter(rdb, 30, time.Minute), mapHandler.Geocode)
	mapAuth.Get("/reverse-geocode", mw.RateLimiter(rdb, 30, time.Minute), mapHandler.ReverseGeocode)
	mapAuth.Post("/route", mw.RateLimiter(rdb, 20, time.Minute), mapHandler.GetRoute)
	mapAuth.Get("/eta/:bookingID", mapHandler.GetLiveETA)
	mapAuth.Put("/location", mapHandler.UpdateUserLocation)
	mapAuth.Post("/location/permission", mapHandler.RecordLocationPermission)
	mapAuth.Get("/transporters/nearby", mapHandler.GetNearbyTransporters)
	mapAuth.Get("/booking/:id/route", mapHandler.GetBookingRoute)
	// Admin-only map endpoints
	mapAdmin := mapAuth.Group("", mw.RequireRole(models.RoleAdmin, models.RoleSuperAdmin))
	mapAdmin.Get("/admin/active-bookings", mapHandler.AdminGetActiveBookings)

	// Admin
	adminGroup := app.Group("/admin",
		mw.JWTAuth(cfg.JWT.Secret, rdb),
		mw.RequireRole(models.RoleAdmin, models.RoleSuperAdmin),
	)
	adminGroup.Put("/users/:id/status", adminHandler.UpdateUserStatus)
	adminGroup.Put("/users/:id/role", mw.RequireRole(models.RoleSuperAdmin), adminHandler.ChangeUserRole)
	adminGroup.Get("/users/:id/detail", dashHandler.GetAdminUserDetail)
	adminGroup.Get("/users/search", adminHandler.SearchUsers)
	adminGroup.Get("/dashboard", dashHandler.GetAdminDashboard)
	adminGroup.Get("/audit-logs", dashHandler.GetAuditLogs)
	adminGroup.Get("/kyc/queue", kycHandler.GetKYCQueue)
	adminGroup.Put("/kyc/:id/review", kycHandler.ReviewKYC)
	adminGroup.Get("/reports", reportHandler.GetPendingReports)
	adminGroup.Put("/reports/:id/resolve", reportHandler.ResolveReport)
	adminGroup.Post("/ai/query", aiHandler.AIQuery)
	adminGroup.Get("/sos/active", sosHandler.GetActiveAlerts)
	adminGroup.Put("/sos/:id/resolve", sosHandler.ResolveSOS)
	adminGroup.Get("/vehicles/pending", vehicleHandler.GetPendingVehicles)
	adminGroup.Put("/vehicles/:id/review", vehicleHandler.ReviewVehicle)
	adminGroup.Get("/pricing", vehicleHandler.GetPricing)
	adminGroup.Put("/pricing", vehicleHandler.UpsertPricing)
	// Admin management (SUPER_ADMIN only)
	adminGroup.Get("/admins", adminHandler.GetAdmins)
	adminGroup.Post("/admins", mw.RequireRole(models.RoleSuperAdmin), adminHandler.CreateAdmin)
	adminGroup.Delete("/admins/:id", mw.RequireRole(models.RoleSuperAdmin), adminHandler.DeleteAdmin)
	// KYC history
	adminGroup.Get("/kyc/history", kycHandler.GetKYCHistory)
	// Dashboard extras
	adminGroup.Get("/dashboard/daily-bookings", dashHandler.GetDailyBookings)
	adminGroup.Get("/dashboard/active-transporters", dashHandler.GetActiveTransporters)
	adminGroup.Get("/dashboard/user-activity", dashHandler.GetUserActivity)
	// Ban queue
	adminGroup.Get("/ban-queue", reportHandler.GetBanQueue)
	adminGroup.Put("/ban-queue/:id/approve", reportHandler.ApproveBan)

	// ─── Start ───

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	go func() {
		if err := app.Listen(addr); err != nil {
			slog.Error("server error", "error", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down gracefully...")
	sched.Stop()
	app.ShutdownWithTimeout(10 * time.Second)
	if bus != nil {
		bus.Close()
	}
	slog.Info("server stopped")
}
