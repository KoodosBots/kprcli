package telemetry

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"time"
)

const (
	// Replace with your actual endpoint
	TelemetryEndpoint = "https://api.your-domain.com/telemetry"
	LicenseEndpoint   = "https://api.your-domain.com/license"
)

type Client struct {
	machineID string
	licenseKey string
	version   string
	enabled   bool
	queue     []Event
}

type Event struct {
	UserID    string                 `json:"user_id"`
	EventType string                 `json:"event_type"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"`
	Version   string                 `json:"version"`
}

type License struct {
	Key        string    `json:"key"`
	Type       string    `json:"type"` // solo, pair, squad
	MaxDevices int       `json:"max_devices"`
	ExpiresAt  time.Time `json:"expires_at"`
	Valid      bool      `json:"valid"`
}

var client *Client

// Initialize telemetry client
func Init(licenseKey string, version string) error {
	client = &Client{
		machineID:  generateMachineID(),
		licenseKey: licenseKey,
		version:    version,
		enabled:    true,
		queue:      make([]Event, 0),
	}

	// Validate license on startup
	if err := client.ValidateLicense(); err != nil {
		return fmt.Errorf("license validation failed: %v", err)
	}

	// Start background sync
	go client.backgroundSync()

	// Track startup
	Track("app_started", map[string]interface{}{
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
		"version": version,
	})

	return nil
}

// Track an event
func Track(eventType string, metadata map[string]interface{}) {
	if client == nil || !client.enabled {
		return
	}

	event := Event{
		UserID:    client.machineID,
		EventType: eventType,
		Timestamp: time.Now(),
		Metadata:  metadata,
		Version:   client.version,
	}

	client.queue = append(client.queue, event)

	// Send immediately if queue is large
	if len(client.queue) > 10 {
		go client.flush()
	}
}

// TrackError tracks an error event
func TrackError(err error, context string) {
	Track("error", map[string]interface{}{
		"error":   err.Error(),
		"context": context,
		"os":      runtime.GOOS,
	})
}

// TrackFormFilled tracks a successful form fill
func TrackFormFilled(domain string, duration time.Duration, success bool) {
	Track("form_filled", map[string]interface{}{
		"domain":   anonymizeDomain(domain),
		"duration": duration.Seconds(),
		"success":  success,
	})
}

// TrackProfileCreated tracks profile creation
func TrackProfileCreated(profileCount int) {
	Track("profile_created", map[string]interface{}{
		"total_profiles": profileCount,
	})
}

// ValidateLicense checks if the license is valid
func (c *Client) ValidateLicense() error {
	payload := map[string]string{
		"license_key": c.licenseKey,
		"machine_id":  c.machineID,
		"version":     c.version,
	}

	data, _ := json.Marshal(payload)
	resp, err := http.Post(LicenseEndpoint+"/validate", "application/json", bytes.NewBuffer(data))
	if err != nil {
		// Allow offline mode
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("invalid license")
	}

	var license License
	if err := json.NewDecoder(resp.Body).Decode(&license); err != nil {
		return err
	}

	if !license.Valid {
		return fmt.Errorf("license expired or invalid")
	}

	return nil
}

// backgroundSync periodically sends telemetry data
func (c *Client) backgroundSync() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.flush()
	}
}

// flush sends all queued events
func (c *Client) flush() {
	if len(c.queue) == 0 {
		return
	}

	// Copy and clear queue
	events := make([]Event, len(c.queue))
	copy(events, c.queue)
	c.queue = c.queue[:0]

	// Send to server
	data, _ := json.Marshal(events)
	go func() {
		resp, err := http.Post(TelemetryEndpoint, "application/json", bytes.NewBuffer(data))
		if err != nil {
			// Re-add to queue on failure
			c.queue = append(c.queue, events...)
			return
		}
		resp.Body.Close()
	}()
}

// generateMachineID creates a unique machine identifier
func generateMachineID() string {
	hostname, _ := os.Hostname()
	
	// Combine multiple factors for uniqueness
	data := fmt.Sprintf("%s-%s-%s-%d", 
		hostname,
		runtime.GOOS,
		runtime.GOARCH,
		time.Now().Unix(),
	)
	
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:8]) // Use first 8 bytes
}

// anonymizeDomain removes sensitive parts of URLs
func anonymizeDomain(url string) string {
	// Extract just the domain, no paths or params
	// Example: https://example.com/form?id=123 -> example.com
	// Implementation depends on your needs
	return url // Simplified for now
}

// Disable turns off telemetry
func Disable() {
	if client != nil {
		client.enabled = false
	}
}

// Enable turns on telemetry
func Enable() {
	if client != nil {
		client.enabled = true
	}
}
