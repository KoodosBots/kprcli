package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// DatabaseManager handles SQLite database operations
type DatabaseManager struct {
	db       *sql.DB
	dbPath   string
	isMemory bool
}

// DatabaseConfig holds configuration for database connection
type DatabaseConfig struct {
	DatabasePath string
	InMemory     bool
	CreateTables bool
}

// DefaultDatabaseConfig returns sensible defaults
func DefaultDatabaseConfig() *DatabaseConfig {
	homeDir, _ := os.UserHomeDir()
	dbPath := filepath.Join(homeDir, ".ai-form-filler", "data.db")
	
	return &DatabaseConfig{
		DatabasePath: dbPath,
		InMemory:     false,
		CreateTables: true,
	}
}

// NewDatabaseManager creates a new database manager
func NewDatabaseManager(config *DatabaseConfig) (*DatabaseManager, error) {
	if config == nil {
		config = DefaultDatabaseConfig()
	}

	var dsn string
	if config.InMemory {
		dsn = ":memory:"
	} else {
		// Ensure directory exists
		dir := filepath.Dir(config.DatabasePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create database directory: %w", err)
		}
		dsn = config.DatabasePath
	}

	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	dm := &DatabaseManager{
		db:       db,
		dbPath:   config.DatabasePath,
		isMemory: config.InMemory,
	}

	// Create tables if requested
	if config.CreateTables {
		if err := dm.CreateTables(); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to create tables: %w", err)
		}
	}

	return dm, nil
}

// CreateTables creates all necessary database tables
func (dm *DatabaseManager) CreateTables() error {
	queries := []string{
		createUsersTable,
		createClientProfilesTable,
		createFormTemplatesTable,
		createExecutionSessionsTable,
		createLearningSessionsTable,
		createEncryptedDataTable,
		createBackupsTable,
		createIndices,
	}

	for _, query := range queries {
		if _, err := dm.db.Exec(query); err != nil {
			return fmt.Errorf("failed to execute query: %w", err)
		}
	}

	return nil
}

// Close closes the database connection
func (dm *DatabaseManager) Close() error {
	if dm.db != nil {
		return dm.db.Close()
	}
	return nil
}

// GetDB returns the underlying database connection
func (dm *DatabaseManager) GetDB() *sql.DB {
	return dm.db
}

// GetPath returns the database file path
func (dm *DatabaseManager) GetPath() string {
	return dm.dbPath
}

// IsMemory returns true if using in-memory database
func (dm *DatabaseManager) IsMemory() bool {
	return dm.isMemory
}

// BeginTransaction starts a new database transaction
func (dm *DatabaseManager) BeginTransaction() (*sql.Tx, error) {
	return dm.db.Begin()
}

// ExecuteInTransaction executes a function within a database transaction
func (dm *DatabaseManager) ExecuteInTransaction(fn func(*sql.Tx) error) error {
	tx, err := dm.BeginTransaction()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("transaction error: %v, rollback error: %w", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Vacuum optimizes the database
func (dm *DatabaseManager) Vacuum() error {
	_, err := dm.db.Exec("VACUUM")
	return err
}

// GetDatabaseSize returns the size of the database file in bytes
func (dm *DatabaseManager) GetDatabaseSize() (int64, error) {
	if dm.isMemory {
		return 0, nil
	}

	info, err := os.Stat(dm.dbPath)
	if err != nil {
		return 0, err
	}

	return info.Size(), nil
}

// CheckIntegrity checks database integrity
func (dm *DatabaseManager) CheckIntegrity() error {
	var result string
	err := dm.db.QueryRow("PRAGMA integrity_check").Scan(&result)
	if err != nil {
		return fmt.Errorf("failed to check integrity: %w", err)
	}

	if result != "ok" {
		return fmt.Errorf("database integrity check failed: %s", result)
	}

	return nil
}

// Database schema definitions
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'solo',
    device_count INTEGER DEFAULT 0,
    daily_executions INTEGER DEFAULT 0,
    api_keys TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`

const createClientProfilesTable = `
CREATE TABLE IF NOT EXISTS client_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    personal_data TEXT NOT NULL, -- Encrypted JSON
    preferences TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`

const createFormTemplatesTable = `
CREATE TABLE IF NOT EXISTS form_templates (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    form_type TEXT NOT NULL,
    fields TEXT NOT NULL, -- JSON
    selectors TEXT NOT NULL, -- JSON
    validation_rules TEXT, -- JSON
    success_rate REAL DEFAULT 0.0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`

const createExecutionSessionsTable = `
CREATE TABLE IF NOT EXISTS execution_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    urls TEXT NOT NULL, -- JSON array
    status TEXT NOT NULL,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    results TEXT, -- JSON
    errors TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES client_profiles(id) ON DELETE CASCADE
);`

const createLearningSessionsTable = `
CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    template_id TEXT,
    analysis_data TEXT NOT NULL, -- JSON
    improvements TEXT, -- JSON
    success_rate REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE SET NULL
);`

const createEncryptedDataTable = `
CREATE TABLE IF NOT EXISTS encrypted_data (
    id TEXT PRIMARY KEY,
    data_type TEXT NOT NULL, -- 'profile', 'template', etc.
    entity_id TEXT NOT NULL, -- ID of the entity this data belongs to
    encrypted_data BLOB NOT NULL,
    encryption_method TEXT NOT NULL DEFAULT 'AES-256-GCM',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(data_type, entity_id)
);`

const createBackupsTable = `
CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    backup_type TEXT NOT NULL, -- 'full', 'profiles', 'templates'
    file_path TEXT NOT NULL,
    file_size INTEGER,
    checksum TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    restored_at DATETIME,
    metadata TEXT -- JSON
);`

const createIndices = `
CREATE INDEX IF NOT EXISTS idx_client_profiles_user_id ON client_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_domain ON form_templates(domain);
CREATE INDEX IF NOT EXISTS idx_form_templates_url ON form_templates(url);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_user_id ON execution_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_profile_id ON execution_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_status ON execution_sessions(status);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_url ON learning_sessions(url);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_template_id ON learning_sessions(template_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_data_type_entity ON encrypted_data(data_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
`