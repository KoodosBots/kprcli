package messaging

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// NativeMessage represents a message exchanged with the browser extension
type NativeMessage struct {
	ID      string      `json:"id,omitempty"`
	Type    string      `json:"type"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Success bool        `json:"success"`
}

// MessageHandler defines the interface for handling different message types
type MessageHandler interface {
	HandleMessage(msg *NativeMessage) (*NativeMessage, error)
}

// NativeHost manages communication between the CLI and browser extension
type NativeHost struct {
	input       io.Reader
	output      io.Writer
	handlers    map[string]MessageHandler
	mu          sync.RWMutex
	isRunning   bool
	stopChan    chan struct{}
	messageChan chan *NativeMessage
}

// NewNativeHost creates a new native messaging host
func NewNativeHost() *NativeHost {
	return &NativeHost{
		input:       os.Stdin,
		output:      os.Stdout,
		handlers:    make(map[string]MessageHandler),
		stopChan:    make(chan struct{}),
		messageChan: make(chan *NativeMessage, 100),
	}
}

// RegisterHandler registers a message handler for a specific message type
func (nh *NativeHost) RegisterHandler(messageType string, handler MessageHandler) {
	nh.mu.Lock()
	defer nh.mu.Unlock()
	nh.handlers[messageType] = handler
}

// Start begins listening for messages from the browser extension
func (nh *NativeHost) Start() error {
	nh.mu.Lock()
	if nh.isRunning {
		nh.mu.Unlock()
		return fmt.Errorf("native host is already running")
	}
	nh.isRunning = true
	nh.mu.Unlock()

	// Start message processing goroutine
	go nh.processMessages()

	// Start reading messages
	return nh.readMessages()
}

// Stop stops the native messaging host
func (nh *NativeHost) Stop() {
	nh.mu.Lock()
	defer nh.mu.Unlock()
	
	if !nh.isRunning {
		return
	}
	
	nh.isRunning = false
	close(nh.stopChan)
}

// SendMessage sends a message to the browser extension
func (nh *NativeHost) SendMessage(msg *NativeMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Write message length (4 bytes, little endian)
	length := uint32(len(data))
	if err := binary.Write(nh.output, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("failed to write message length: %w", err)
	}

	// Write message data
	if _, err := nh.output.Write(data); err != nil {
		return fmt.Errorf("failed to write message data: %w", err)
	}

	return nil
}

// readMessages reads messages from the browser extension
func (nh *NativeHost) readMessages() error {
	reader := bufio.NewReader(nh.input)

	for {
		select {
		case <-nh.stopChan:
			return nil
		default:
		}

		// Read message length (4 bytes, little endian)
		var length uint32
		if err := binary.Read(reader, binary.LittleEndian, &length); err != nil {
			if err == io.EOF {
				return nil // Normal termination
			}
			return fmt.Errorf("failed to read message length: %w", err)
		}

		// Validate message length
		if length == 0 || length > 1024*1024 { // Max 1MB
			return fmt.Errorf("invalid message length: %d", length)
		}

		// Read message data
		data := make([]byte, length)
		if _, err := io.ReadFull(reader, data); err != nil {
			return fmt.Errorf("failed to read message data: %w", err)
		}

		// Parse message
		var msg NativeMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			// Send error response
			errorMsg := &NativeMessage{
				ID:      msg.ID,
				Type:    "ERROR",
				Error:   fmt.Sprintf("failed to parse message: %v", err),
				Success: false,
			}
			nh.SendMessage(errorMsg)
			continue
		}

		// Queue message for processing
		select {
		case nh.messageChan <- &msg:
		case <-nh.stopChan:
			return nil
		default:
			// Channel full, drop message
			errorMsg := &NativeMessage{
				ID:      msg.ID,
				Type:    "ERROR",
				Error:   "message queue full",
				Success: false,
			}
			nh.SendMessage(errorMsg)
		}
	}
}

// processMessages processes queued messages
func (nh *NativeHost) processMessages() {
	for {
		select {
		case msg := <-nh.messageChan:
			nh.handleMessage(msg)
		case <-nh.stopChan:
			return
		}
	}
}

// handleMessage handles a single message
func (nh *NativeHost) handleMessage(msg *NativeMessage) {
	nh.mu.RLock()
	handler, exists := nh.handlers[msg.Type]
	nh.mu.RUnlock()

	var response *NativeMessage
	var err error

	if !exists {
		response = &NativeMessage{
			ID:      msg.ID,
			Type:    "ERROR",
			Error:   fmt.Sprintf("unknown message type: %s", msg.Type),
			Success: false,
		}
	} else {
		response, err = handler.HandleMessage(msg)
		if err != nil {
			response = &NativeMessage{
				ID:      msg.ID,
				Type:    "ERROR",
				Error:   err.Error(),
				Success: false,
			}
		} else if response == nil {
			// Handler didn't return a response, create a default success response
			response = &NativeMessage{
				ID:      msg.ID,
				Type:    "SUCCESS",
				Success: true,
			}
		}
	}

	// Ensure response has the same ID as the request
	if response.ID == "" {
		response.ID = msg.ID
	}

	// Send response
	if err := nh.SendMessage(response); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to send response: %v\n", err)
	}
}

// SendNotification sends an unsolicited notification to the extension
func (nh *NativeHost) SendNotification(messageType string, data interface{}) error {
	msg := &NativeMessage{
		Type:    messageType,
		Data:    data,
		Success: true,
	}
	return nh.SendMessage(msg)
}

// SendError sends an error notification to the extension
func (nh *NativeHost) SendError(messageType string, errorMsg string) error {
	msg := &NativeMessage{
		Type:    messageType,
		Error:   errorMsg,
		Success: false,
	}
	return nh.SendMessage(msg)
}

// IsRunning returns whether the native host is currently running
func (nh *NativeHost) IsRunning() bool {
	nh.mu.RLock()
	defer nh.mu.RUnlock()
	return nh.isRunning
}

// SetTimeout sets a timeout for the native host to automatically stop
func (nh *NativeHost) SetTimeout(duration time.Duration) {
	go func() {
		timer := time.NewTimer(duration)
		defer timer.Stop()
		
		select {
		case <-timer.C:
			nh.Stop()
		case <-nh.stopChan:
			return
		}
	}()
}