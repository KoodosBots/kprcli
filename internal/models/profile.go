package models

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

// ClientProfile represents a client profile with personal data
type ClientProfile struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	PersonalData PersonalData `json:"personalData"`
	Preferences  Preferences  `json:"preferences"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

// PersonalData contains the personal information for form filling
type PersonalData struct {
	FirstName   string  `json:"firstName"`
	LastName    string  `json:"lastName"`
	Email       string  `json:"email"`
	Phone       string  `json:"phone"`
	Address     Address `json:"address"`
	DateOfBirth string  `json:"dateOfBirth"` // Format: YYYY-MM-DD
	CustomFields map[string]interface{} `json:"customFields,omitempty"`
}

// Address represents a physical address
type Address struct {
	Street1    string `json:"street1"`
	Street2    string `json:"street2,omitempty"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

// Preferences contains profile-specific preferences
type Preferences struct {
	AutoFill        bool   `json:"autoFill"`
	SkipValidation  bool   `json:"skipValidation"`
	DefaultTimeout  int    `json:"defaultTimeout"` // in seconds
	PreferredBrowser string `json:"preferredBrowser"`
}

// NewClientProfile creates a new client profile with default values
func NewClientProfile(name string) *ClientProfile {
	return &ClientProfile{
		ID:   uuid.New().String(),
		Name: name,
		PersonalData: PersonalData{
			CustomFields: make(map[string]interface{}),
		},
		Preferences: Preferences{
			AutoFill:        true,
			SkipValidation:  false,
			DefaultTimeout:  30,
			PreferredBrowser: "chrome",
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// Validate checks if the profile has required fields
func (p *ClientProfile) Validate() error {
	if p.Name == "" {
		return fmt.Errorf("profile name is required")
	}
	if p.PersonalData.FirstName == "" {
		return fmt.Errorf("first name is required")
	}
	if p.PersonalData.LastName == "" {
		return fmt.Errorf("last name is required")
	}
	if p.PersonalData.Email == "" {
		return fmt.Errorf("email is required")
	}
	return nil
}

// Encrypt encrypts the profile data using AES encryption
func (p *ClientProfile) Encrypt(key []byte) ([]byte, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal profile: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, data, nil)
	return ciphertext, nil
}

// DecryptProfile decrypts profile data
func DecryptProfile(encryptedData []byte, key []byte) (*ClientProfile, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(encryptedData) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := encryptedData[:nonceSize], encryptedData[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	var profile ClientProfile
	if err := json.Unmarshal(plaintext, &profile); err != nil {
		return nil, fmt.Errorf("failed to unmarshal profile: %w", err)
	}

	return &profile, nil
}

// Update updates the profile with new data and sets UpdatedAt
func (p *ClientProfile) Update() {
	p.UpdatedAt = time.Now()
}

// Clone creates a deep copy of the profile
func (p *ClientProfile) Clone() *ClientProfile {
	data, _ := json.Marshal(p)
	var clone ClientProfile
	json.Unmarshal(data, &clone)
	return &clone
}