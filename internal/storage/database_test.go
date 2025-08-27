package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultDatabaseConfig(t *testing.T) {
	config := DefaultDatabaseConfig()

	if config == nil {
		t.Error("Expected config to be created")
	}

	if config.InMemory {
		t.Error("Expected InMemory to be false by default")
	}

	if !config.CreateTables {
		t.Error("Expected CreateTables to be true by default")
	}

	if config.DatabasePath == "" {
		t.Error("Expected DatabasePath to be set")
	}
}

func TestNewDatabaseManager(t *testing.T) {
	// Test with in-memory database
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	if !dm.IsMemory() {
		t.Error("Expected database to be in-memory")
	}

	if dm.GetDB() == nil {
		t.Error("Expected database connection to be available")
	}
}

func TestNewDatabaseManagerWithFile(t *testing.T) {
	// Create temporary directory
	tempDir, err := os.MkdirTemp("", "test_db")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	config := &DatabaseConfig{
		DatabasePath: dbPath,
		InMemory:     false,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	if dm.IsMemory() {
		t.Error("Expected database to be file-based")
	}

	if dm.GetPath() != dbPath {
		t.Errorf("Expected path to be %s, got %s", dbPath, dm.GetPath())
	}

	// Check that database file was created
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("Expected database file to be created")
	}
}

func TestCreateTables(t *testing.T) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: false, // Don't create tables automatically
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	// Create tables manually
	err = dm.CreateTables()
	if err != nil {
		t.Fatalf("Failed to create tables: %v", err)
	}

	// Verify tables exist by querying them
	tables := []string{
		"users", "client_profiles", "form_templates", 
		"execution_sessions", "learning_sessions", 
		"encrypted_data", "backups",
	}

	for _, table := range tables {
		query := "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
		var name string
		err := dm.GetDB().QueryRow(query, table).Scan(&name)
		if err != nil {
			t.Errorf("Table %s does not exist: %v", table, err)
		}
	}
}

func TestDatabaseTransaction(t *testing.T) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	// Test successful transaction
	err = dm.ExecuteInTransaction(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO users (id, email) VALUES (?, ?)", "test-user", "test@example.com")
		return err
	})
	if err != nil {
		t.Fatalf("Transaction failed: %v", err)
	}

	// Verify data was inserted
	var count int
	err = dm.GetDB().QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", "test-user").Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query users: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 user, got %d", count)
	}

	// Test failed transaction (should rollback)
	err = dm.ExecuteInTransaction(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO users (id, email) VALUES (?, ?)", "test-user-2", "test2@example.com")
		if err != nil {
			return err
		}
		// Force an error to trigger rollback
		return fmt.Errorf("forced error")
	})
	if err == nil {
		t.Error("Expected transaction to fail")
	}

	// Verify rollback worked
	err = dm.GetDB().QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", "test-user-2").Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query users: %v", err)
	}
	if count != 0 {
		t.Errorf("Expected 0 users (rollback), got %d", count)
	}
}

func TestDatabaseIntegrity(t *testing.T) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	// Check integrity
	err = dm.CheckIntegrity()
	if err != nil {
		t.Errorf("Database integrity check failed: %v", err)
	}
}

func TestDatabaseVacuum(t *testing.T) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	// Vacuum should not fail
	err = dm.Vacuum()
	if err != nil {
		t.Errorf("Vacuum failed: %v", err)
	}
}

func TestGetDatabaseSize(t *testing.T) {
	// Test in-memory database
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	size, err := dm.GetDatabaseSize()
	if err != nil {
		t.Errorf("Failed to get database size: %v", err)
	}
	if size != 0 {
		t.Errorf("Expected in-memory database size to be 0, got %d", size)
	}

	// Test file database
	tempDir, err := os.MkdirTemp("", "test_db")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	fileConfig := &DatabaseConfig{
		DatabasePath: dbPath,
		InMemory:     false,
		CreateTables: true,
	}

	fileDm, err := NewDatabaseManager(fileConfig)
	if err != nil {
		t.Fatalf("Failed to create file database manager: %v", err)
	}
	defer fileDm.Close()

	fileSize, err := fileDm.GetDatabaseSize()
	if err != nil {
		t.Errorf("Failed to get file database size: %v", err)
	}
	if fileSize <= 0 {
		t.Errorf("Expected file database size to be > 0, got %d", fileSize)
	}
}

func TestDatabaseManagerClose(t *testing.T) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		t.Fatalf("Failed to create database manager: %v", err)
	}

	// Close should not fail
	err = dm.Close()
	if err != nil {
		t.Errorf("Close failed: %v", err)
	}

	// Second close should not fail
	err = dm.Close()
	if err != nil {
		t.Errorf("Second close failed: %v", err)
	}
}

func TestDatabaseManagerNilConfig(t *testing.T) {
	dm, err := NewDatabaseManager(nil)
	if err != nil {
		t.Fatalf("Failed to create database manager with nil config: %v", err)
	}
	defer dm.Close()

	// Should use default config
	if dm.IsMemory() {
		t.Error("Expected default config to use file database")
	}
}

// Benchmark tests
func BenchmarkDatabaseInsert(b *testing.B) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		b.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		userID := fmt.Sprintf("user-%d", i)
		email := fmt.Sprintf("user%d@example.com", i)
		_, err := dm.GetDB().Exec("INSERT INTO users (id, email) VALUES (?, ?)", userID, email)
		if err != nil {
			b.Fatalf("Insert failed: %v", err)
		}
	}
}

func BenchmarkDatabaseQuery(b *testing.B) {
	config := &DatabaseConfig{
		InMemory:     true,
		CreateTables: true,
	}

	dm, err := NewDatabaseManager(config)
	if err != nil {
		b.Fatalf("Failed to create database manager: %v", err)
	}
	defer dm.Close()

	// Insert test data
	for i := 0; i < 1000; i++ {
		userID := fmt.Sprintf("user-%d", i)
		email := fmt.Sprintf("user%d@example.com", i)
		_, err := dm.GetDB().Exec("INSERT INTO users (id, email) VALUES (?, ?)", userID, email)
		if err != nil {
			b.Fatalf("Insert failed: %v", err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		userID := fmt.Sprintf("user-%d", i%1000)
		var email string
		err := dm.GetDB().QueryRow("SELECT email FROM users WHERE id = ?", userID).Scan(&email)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
	}
}