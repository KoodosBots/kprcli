package storage

import (
	"testing"
)

func TestDefaultEncryptionConfig(t *testing.T) {
	config := DefaultEncryptionConfig()

	if config == nil {
		t.Error("Expected config to be created")
	}

	if config.MasterPassword != "" {
		t.Error("Expected MasterPassword to be empty by default")
	}

	if config.Salt != nil {
		t.Error("Expected Salt to be nil by default")
	}

	if config.Iterations != 100000 {
		t.Errorf("Expected Iterations to be 100000, got %d", config.Iterations)
	}
}

func TestNewEncryptionService(t *testing.T) {
	config := &EncryptionConfig{
		MasterPassword: "test-password-123",
		Iterations:     10000,
	}

	es, err := NewEncryptionService(config)
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	if es == nil {
		t.Error("Expected encryption service to be created")
	}

	if es.masterKey == nil {
		t.Error("Expected master key to be set")
	}

	if len(es.masterKey) != 32 {
		t.Errorf("Expected master key to be 32 bytes, got %d", len(es.masterKey))
	}
}

func TestNewEncryptionServiceNoPassword(t *testing.T) {
	config := &EncryptionConfig{
		MasterPassword: "",
	}

	_, err := NewEncryptionService(config)
	if err == nil {
		t.Error("Expected error when no password provided")
	}
}

func TestEncryptDecrypt(t *testing.T) {
	config := &EncryptionConfig{
		MasterPassword: "test-password-123",
		Iterations:     10000,
	}

	es, err := NewEncryptionService(config)
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	testData := []byte("This is a test message for encryption")

	// Encrypt
	encrypted, err := es.Encrypt(testData)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	if len(encrypted) == 0 {
		t.Error("Expected encrypted data to have length > 0")
	}

	// Decrypt
	decrypted, err := es.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decryption failed: %v", err)
	}

	if string(decrypted) != string(testData) {
		t.Errorf("Decrypted data doesn't match original. Expected: %s, Got: %s", 
			string(testData), string(decrypted))
	}
}

func TestEncryptDecryptString(t *testing.T) {
	config := &EncryptionConfig{
		MasterPassword: "test-password-123",
		Iterations:     10000,
	}

	es, err := NewEncryptionService(config)
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	testString := "This is a test string for encryption"

	// Encrypt
	encrypted, err := es.EncryptString(testString)
	if err != nil {
		t.Fatalf("String encryption failed: %v", err)
	}

	if encrypted == "" {
		t.Error("Expected encrypted string to be non-empty")
	}

	if encrypted == testString {
		t.Error("Encrypted string should not match original")
	}

	// Decrypt
	decrypted, err := es.DecryptString(encrypted)
	if err != nil {
		t.Fatalf("String decryption failed: %v", err)
	}

	if decrypted != testString {
		t.Errorf("Decrypted string doesn't match original. Expected: %s, Got: %s", 
			testString, decrypted)
	}
}

func TestEncryptionWithDifferentPasswords(t *testing.T) {
	config1 := &EncryptionConfig{
		MasterPassword: "password1",
		Iterations:     10000,
	}

	config2 := &EncryptionConfig{
		MasterPassword: "password2",
		Iterations:     10000,
	}

	es1, err := NewEncryptionService(config1)
	if err != nil {
		t.Fatalf("Failed to create encryption service 1: %v", err)
	}

	es2, err := NewEncryptionService(config2)
	if err != nil {
		t.Fatalf("Failed to create encryption service 2: %v", err)
	}

	testData := []byte("Test data")

	// Encrypt with first service
	encrypted, err := es1.Encrypt(testData)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	// Try to decrypt with second service (should fail)
	_, err = es2.Decrypt(encrypted)
	if err == nil {
		t.Error("Expected decryption to fail with different password")
	}
}

func TestGenerateKey(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	if len(key) != 32 {
		t.Errorf("Expected key length to be 32, got %d", len(key))
	}

	// Generate another key and ensure they're different
	key2, err := GenerateKey()
	if err != nil {
		t.Fatalf("Failed to generate second key: %v", err)
	}

	if string(key) == string(key2) {
		t.Error("Generated keys should be different")
	}
}

func TestGenerateSalt(t *testing.T) {
	salt, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate salt: %v", err)
	}

	if len(salt) != 32 {
		t.Errorf("Expected salt length to be 32, got %d", len(salt))
	}

	// Generate another salt and ensure they're different
	salt2, err := GenerateSalt()
	if err != nil {
		t.Fatalf("Failed to generate second salt: %v", err)
	}

	if string(salt) == string(salt2) {
		t.Error("Generated salts should be different")
	}
}

func TestValidateKey(t *testing.T) {
	// Valid key
	validKey := make([]byte, 32)
	err := ValidateKey(validKey)
	if err != nil {
		t.Errorf("Valid key should pass validation: %v", err)
	}

	// Invalid key (too short)
	shortKey := make([]byte, 16)
	err = ValidateKey(shortKey)
	if err == nil {
		t.Error("Short key should fail validation")
	}

	// Invalid key (too long)
	longKey := make([]byte, 64)
	err = ValidateKey(longKey)
	if err == nil {
		t.Error("Long key should fail validation")
	}
}

func TestDeriveKeyFromPassword(t *testing.T) {
	password := "test-password"
	salt := []byte("test-salt-32-bytes-long-enough!!")
	iterations := 10000

	key := DeriveKeyFromPassword(password, salt, iterations)

	if len(key) != 32 {
		t.Errorf("Expected derived key length to be 32, got %d", len(key))
	}

	// Same inputs should produce same key
	key2 := DeriveKeyFromPassword(password, salt, iterations)
	if string(key) != string(key2) {
		t.Error("Same inputs should produce same derived key")
	}

	// Different password should produce different key
	key3 := DeriveKeyFromPassword("different-password", salt, iterations)
	if string(key) == string(key3) {
		t.Error("Different password should produce different key")
	}
}

// Benchmark tests
func BenchmarkEncrypt(b *testing.B) {
	config := &EncryptionConfig{
		MasterPassword: "test-password-123",
		Iterations:     10000,
	}

	es, err := NewEncryptionService(config)
	if err != nil {
		b.Fatalf("Failed to create encryption service: %v", err)
	}

	testData := []byte("This is test data for benchmarking encryption performance")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := es.Encrypt(testData)
		if err != nil {
			b.Fatalf("Encryption failed: %v", err)
		}
	}
}

func BenchmarkDecrypt(b *testing.B) {
	config := &EncryptionConfig{
		MasterPassword: "test-password-123",
		Iterations:     10000,
	}

	es, err := NewEncryptionService(config)
	if err != nil {
		b.Fatalf("Failed to create encryption service: %v", err)
	}

	testData := []byte("This is test data for benchmarking decryption performance")
	encrypted, err := es.Encrypt(testData)
	if err != nil {
		b.Fatalf("Failed to encrypt test data: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := es.Decrypt(encrypted)
		if err != nil {
			b.Fatalf("Decryption failed: %v", err)
		}
	}
}