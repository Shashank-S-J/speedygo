package natsbus

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
)

// Bus wraps NATS JetStream for pub/sub event communication.
type Bus struct {
	conn *nats.Conn
	js   nats.JetStreamContext
	log  *slog.Logger
}

// New connects to NATS and initializes JetStream.
func New(url string, log *slog.Logger) (*Bus, error) {
	nc, err := nats.Connect(url,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(10),
		nats.ReconnectWait(2*time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			log.Warn("NATS disconnected", "error", err)
		}),
		nats.ReconnectHandler(func(_ *nats.Conn) {
			log.Info("NATS reconnected")
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	js, err := nc.JetStream()
	if err != nil {
		return nil, fmt.Errorf("failed to create JetStream context: %w", err)
	}

	log.Info("NATS JetStream connected", "url", url)
	return &Bus{conn: nc, js: js, log: log}, nil
}

// EnsureStream creates a stream if it doesn't exist.
func (b *Bus) EnsureStream(name string, subjects []string) error {
	_, err := b.js.StreamInfo(name)
	if err != nil {
		_, err = b.js.AddStream(&nats.StreamConfig{
			Name:       name,
			Subjects:   subjects,
			Retention:  nats.LimitsPolicy,
			MaxAge:     72 * time.Hour,
			Storage:    nats.FileStorage,
			Replicas:   1,
			Discard:    nats.DiscardOld,
			MaxMsgSize: 1 << 20, // 1MB
		})
		if err != nil {
			return fmt.Errorf("failed to create stream %s: %w", name, err)
		}
		b.log.Info("stream created", "name", name, "subjects", subjects)
	}
	return nil
}

// Publish sends a message to a NATS subject.
func (b *Bus) Publish(subject string, data interface{}) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}
	_, err = b.js.Publish(subject, payload)
	if err != nil {
		return fmt.Errorf("failed to publish to %s: %w", subject, err)
	}
	b.log.Debug("event published", "subject", subject)
	return nil
}

// Subscribe creates a durable consumer for a subject.
func (b *Bus) Subscribe(subject, durable string, handler func([]byte) error) error {
	_, err := b.js.Subscribe(subject, func(msg *nats.Msg) {
		if err := handler(msg.Data); err != nil {
			b.log.Error("event handler failed", "subject", subject, "error", err)
			msg.Nak()
			return
		}
		msg.Ack()
	}, nats.Durable(durable), nats.ManualAck(), nats.AckWait(30*time.Second))
	if err != nil {
		return fmt.Errorf("failed to subscribe to %s: %w", subject, err)
	}
	b.log.Info("subscribed", "subject", subject, "durable", durable)
	return nil
}

// Close shuts down the NATS connection.
func (b *Bus) Close() {
	if b.conn != nil {
		b.conn.Drain()
	}
}
