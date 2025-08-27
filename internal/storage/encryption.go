package storage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

// EncryptionService handles encryption and decryption of sensitive data
type EncryptionService struct {
	masterKey []byte
}

// EncryptionConfig holds configuration for encryption
type EncryptionConfig struct {
	MasterPassword string
	Salt           []byte
	Iterations     int
}

// DefaultEncryptionConfig returns sensible defaults
func DefaultEncryptionConfig() *EncryptionConfig {
	return &EncryptionConfig{
		MasterPassword: "", // Should be provided by user
		Salt:           nil, // Will be generated if not provided
		Iterations:     100000,
	}
}

// NewEncryptionService creates a new encryption service
func NewEncryptionService(config *EncryptionConfig) (*EncryptionService, error) {
	if config == nil {
		config = DefaultEncryptionConfig()
	}

	if config.MasterPassword == "" {
		return nil, fmt.Errorf("master password is required")
	}

	// Generate salt if not provided
	salt := config.Salt
	if salt == nil {
		salt = make([]byte, 32)
		if _, err := rand.Read(salt); err != nil {
			return nil, fmt.Errorf("failed to generate salt: %w", err)
		}
	}

	// Derive key from password using PBKDF2
	masterKey := pbkdf2.Key([]byte(config.MasterPassword), salt, config.Iterations, 32, sha256.New)

	return &EncryptionService{
		masterKey: masterKey,
	}, nil
}

// Encrypt encrypts data using AES-256-GCM
func (es *EncryptionService) Encrypt(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(es.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts data using AES-256-GCM
func (es *EncryptionService) Decrypt(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(es.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// EncryptString encrypts a string and returns base64 encoded result
func (es *EncryptionService) EncryptString(plaintext string) (string, error) {
	encrypted, err := es.Encrypt([]byte(plaintext))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

// DecryptString decrypts a base64 encoded string
func (es *EncryptionService) DecryptString(ciphertext string) (string, error) {
	encrypted, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	decrypted, err := es.Decrypt(encrypted)
	if err != nil {
		return "", err
	}

	return string(decrypted), nil
}

// GenerateKey generates a new random encryption key
func GenerateKey() ([]byte, error) {
	key := make([]byte, 32) // 256 bits
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}
	return key, nil
}

// GenerateSalt generates a new random salt
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("failed to generate salt: %w", err)
	}
	return salt, nil
}

// DeriveKeyFromPassword derives an encryption key from a password
func DeriveKeyFromPassword(password string, salt []byte, iterations int) []byte {
	return pbkdf2.Key([]byte(password), salt, iterations, 32, sha256.New)
}

// ValidateKey validates that a key is the correct length
func ValidateKey(key []byte) error {
	if len(key) != 32 {
		return fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	return nil
}

// SecureEncryptedStorage provides secure storage for encrypted data
type SecureEncryptedStorage struct {
	db        *DatabaseManager
	encryption *EncryptionService
}

// NewSecureEncryptedStorage creates a new secure encrypted storage
func NewSecureEncryptedStorage(db *DatabaseManager, encryption *EncryptionService) *SecureEncryptedStorage {
	return &SecureEncryptedStorage{
		db:         db,
		encryption: encryption,
	}
}

// StoreEncryptedData stores encrypted data in the database
func (ses *SecureEncryptedStorage) StoreEncryptedData(dataType, entityID string, data []byte) error {
	encrypted, err := ses.encryption.Encrypt(data)
	if err != nil {
		return fmt.Errorf("failed to encrypt data: %w", err)
	}

	query := `
		INSERT OR REPLACE INTO encrypted_data 
		(id, data_type, entity_id, encrypted_data, encryption_method, updated_at) 
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`

	id := fmt.Sprintf("%s_%s", dataType, entityID)
	_, err = ses.db.GetDB().Exec(query, id, dataType, entityID, encrypted, "AES-256-GCM")
	if err != nil {
		return fmt.Errorf("failed to store encrypted data: %w", err)
	}

	return nil
}

// RetrieveEncryptedData retrieves and decrypts data from the database
func (ses *SecureEncryptedStorage) RetrieveEncryptedData(dataType, entityID string) ([]byte, error) {
	query := `
		SELECT encrypted_data FROM encrypted_data 
		WHERE data_type = ? AND entity_id = ?
	`

	var encrypted []byte
	err := ses.db.GetDB().QueryRow(query, dataType, entityID).Scan(&encrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve encrypted data: %w", err)
	}

	decrypted, err := ses.encryption.Decrypt(encrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt data: %w", err)
	}

	return decrypted, nil
}

// DeleteEncryptedData deletes encrypted data from the database
func (ses *SecureEncryptedStorage) DeleteEncryptedData(dataType, entityID string) error {
	query := `DELETE FROM encrypted_data WHERE data_type = ? AND entity_id = ?`
	_, err := ses.db.GetDB().Exec(query, dataType, entityID)
	if err != nil {
		return fmt.Errorf("failed to delete encrypted data: %w", err)
	}
	return nil
}

// ListEncryptedData lists all encrypted data of a specific type
func (ses *SecureEncryptedStorage) ListEncryptedData(dataType string) ([]string, error) {
	query := `SELECT entity_id FROM encrypted_data WHERE data_type = ? ORDER BY created_at`
	
	rows, err := ses.db.GetDB().Query(query, dataType)
	if err != nil {
		return nil, fmt.Errorf("failed to list encrypted data: %w", err)
	}
	defer rows.Close()

	var entityIDs []string
	for rows.Next() {
		var entityID string
		if err := rows.Scan(&entityID); err != nil {
			return nil, fmt.Errorf("failed to scan entity ID: %w", err)
		}
		entityIDs = append(entityIDs, entityID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return entityIDs, nil
}

// GetEncryptedDataInfo returns metadata about encrypted data
func (ses *SecureEncryptedStorage) GetEncryptedDataInfo(dataType, entityID string) (*EncryptedDataInfo, error) {
	query := `
		SELECT data_type, entity_id, encryption_method, created_at, updated_at 
		FROM encrypted_data 
		WHERE data_type = ? AND entity_id = ?
	`

	info := &EncryptedDataInfo{}
	err := ses.db.GetDB().QueryRow(query, dataType, entityID).Scan(
		&info.DataType,
		&info.EntityID,
		&info.EncryptionMethod,
		&info.CreatedAt,
		&info.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get encrypted data info: %w", err)
	}

	return info, nil
}

// EncryptedDataInfo contains metadata about encrypted data
type EncryptedDataInfo struct {
	DataType         string `json:"dataType"`
	EntityID         string `json:"entityId"`
	EncryptionMethod string `json:"encryptionMethod"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

// ChangeEncryptionKey changes the encryption key for all stored data
func (ses *SecureEncryptedStorage) ChangeEncryptionKey(newEncryption *EncryptionService) error {
	return ses.db.ExecuteInTransaction(func(tx *sql.Tx) error {
		// Get all encrypted data
		query := `SELECT data_type, entity_id, encrypted_data FROM encrypted_data`
		rows, err := tx.Query(query)
		if err != nil {
			return fmt.Errorf("failed to query encrypted data: %w", err)
		}
		defer rows.Close()

		type encryptedItem struct {
			dataType     string
			entityID     string
			encryptedData []byte
		}

		var items []encryptedItem
		for rows.Next() {
			var item encryptedItem
			if err := rows.Scan(&item.dataType, &item.entityID, &item.encryptedData); err != nil {
				return fmt.Errorf("failed to scan encrypted data: %w", err)
			}
			items = append(items, item)
		}

		// Re-encrypt all data with new key
		updateQuery := `
			UPDATE encrypted_data 
			SET encrypted_data = ?, updated_at = CURRENT_TIMESTAMP 
			WHERE data_type = ? AND entity_id = ?
		`

		for _, item := range items {
			// Decrypt with old key
			decrypted, err := ses.encryption.Decrypt(item.encryptedData)
			if err != nil {
				return fmt.Errorf("failed to decrypt data for re-encryption: %w", err)
			}

			// Encrypt with new key
			reencrypted, err := newEncryption.Encrypt(decrypted)
			if err != nil {
				return fmt.Errorf("failed to re-encrypt data: %w", err)
			}

			// Update in database
			_, err = tx.Exec(updateQuery, reencrypted, item.dataType, item.entityID)
			if err != nil {
				return fmt.Errorf("failed to update re-encrypted data: %w", err)
			}
		}

		return nil
	})
}