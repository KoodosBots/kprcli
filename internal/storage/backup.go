package storage

import (
	"archive/zip"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// BackupService handles backup and restore operations
type BackupService struct {
	db         *DatabaseManager
	encryption *EncryptionService
	backupDir  string
}

// BackupConfig holds configuration for backup operations
type BackupConfig struct {
	BackupDirectory string
	IncludeProfiles bool
	IncludeTemplates bool
	IncludeSessions bool
	Compress        bool
	Encrypt         bool
}

// DefaultBackupConfig returns sensible defaults
func DefaultBackupConfig() *BackupConfig {
	homeDir, _ := os.UserHomeDir()
	backupDir := filepath.Join(homeDir, ".ai-form-filler", "backups")
	
	return &BackupConfig{
		BackupDirectory:  backupDir,
		IncludeProfiles:  true,
		IncludeTemplates: true,
		IncludeSessions:  false, // Sessions can be large and are less critical
		Compress:         true,
		Encrypt:          true,
	}
}

// BackupMetadata contains information about a backup
type BackupMetadata struct {
	ID               string    `json:"id"`
	Type             string    `json:"type"`
	CreatedAt        time.Time `json:"createdAt"`
	FilePath         string    `json:"filePath"`
	FileSize         int64     `json:"fileSize"`
	Checksum         string    `json:"checksum"`
	ProfileCount     int       `json:"profileCount"`
	TemplateCount    int       `json:"templateCount"`
	SessionCount     int       `json:"sessionCount"`
	Compressed       bool      `json:"compressed"`
	Encrypted        bool      `json:"encrypted"`
	DatabaseVersion  string    `json:"databaseVersion"`
}

// RestoreResult contains information about a restore operation
type RestoreResult struct {
	BackupID         string `json:"backupId"`
	ProfilesRestored int    `json:"profilesRestored"`
	TemplatesRestored int   `json:"templatesRestored"`
	SessionsRestored int    `json:"sessionsRestored"`
	Errors           []string `json:"errors"`
	Duration         time.Duration `json:"duration"`
}

// NewBackupService creates a new backup service
func NewBackupService(db *DatabaseManager, encryption *EncryptionService, backupDir string) (*BackupService, error) {
	if backupDir == "" {
		homeDir, _ := os.UserHomeDir()
		backupDir = filepath.Join(homeDir, ".ai-form-filler", "backups")
	}

	// Ensure backup directory exists
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create backup directory: %w", err)
	}

	return &BackupService{
		db:         db,
		encryption: encryption,
		backupDir:  backupDir,
	}, nil
}

// CreateFullBackup creates a complete backup of all data
func (bs *BackupService) CreateFullBackup(config *BackupConfig) (*BackupMetadata, error) {
	if config == nil {
		config = DefaultBackupConfig()
	}

	backupID := uuid.New().String()
	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("full_backup_%s_%s.zip", timestamp, backupID[:8])
	backupPath := filepath.Join(bs.backupDir, filename)

	// Create backup file
	backupFile, err := os.Create(backupPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create backup file: %w", err)
	}
	defer backupFile.Close()

	// Create zip writer
	zipWriter := zip.NewWriter(backupFile)
	defer zipWriter.Close()

	metadata := &BackupMetadata{
		ID:              backupID,
		Type:            "full",
		CreatedAt:       time.Now(),
		FilePath:        backupPath,
		Compressed:      config.Compress,
		Encrypted:       config.Encrypt,
		DatabaseVersion: "1.0",
	}

	// Backup profiles
	if config.IncludeProfiles {
		count, err := bs.backupProfiles(zipWriter, config.Encrypt)
		if err != nil {
			return nil, fmt.Errorf("failed to backup profiles: %w", err)
		}
		metadata.ProfileCount = count
	}

	// Backup templates
	if config.IncludeTemplates {
		count, err := bs.backupTemplates(zipWriter, config.Encrypt)
		if err != nil {
			return nil, fmt.Errorf("failed to backup templates: %w", err)
		}
		metadata.TemplateCount = count
	}

	// Backup sessions
	if config.IncludeSessions {
		count, err := bs.backupSessions(zipWriter, config.Encrypt)
		if err != nil {
			return nil, fmt.Errorf("failed to backup sessions: %w", err)
		}
		metadata.SessionCount = count
	}

	// Add metadata to backup
	if err := bs.addMetadataToBackup(zipWriter, metadata); err != nil {
		return nil, fmt.Errorf("failed to add metadata to backup: %w", err)
	}

	// Close zip writer to finalize the file
	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to close zip writer: %w", err)
	}

	// Calculate file size and checksum
	fileInfo, err := os.Stat(backupPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get backup file info: %w", err)
	}
	metadata.FileSize = fileInfo.Size()

	checksum, err := bs.calculateChecksum(backupPath)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate checksum: %w", err)
	}
	metadata.Checksum = checksum

	// Store backup metadata in database
	if err := bs.storeBackupMetadata(metadata); err != nil {
		return nil, fmt.Errorf("failed to store backup metadata: %w", err)
	}

	return metadata, nil
}

// backupProfiles backs up all client profiles
func (bs *BackupService) backupProfiles(zipWriter *zip.Writer, encrypt bool) (int, error) {
	query := `SELECT id, user_id, name, personal_data, preferences, created_at, updated_at FROM client_profiles`
	rows, err := bs.db.GetDB().Query(query)
	if err != nil {
		return 0, fmt.Errorf("failed to query profiles: %w", err)
	}
	defer rows.Close()

	profiles := []map[string]interface{}{}
	count := 0

	for rows.Next() {
		var profile map[string]interface{} = make(map[string]interface{})
		var id, userID, name, personalData, preferences, createdAt, updatedAt string

		err := rows.Scan(&id, &userID, &name, &personalData, &preferences, &createdAt, &updatedAt)
		if err != nil {
			return 0, fmt.Errorf("failed to scan profile: %w", err)
		}

		profile["id"] = id
		profile["user_id"] = userID
		profile["name"] = name
		profile["personal_data"] = personalData
		profile["preferences"] = preferences
		profile["created_at"] = createdAt
		profile["updated_at"] = updatedAt

		profiles = append(profiles, profile)
		count++
	}

	// Convert to JSON
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return 0, fmt.Errorf("failed to marshal profiles: %w", err)
	}

	// Encrypt if requested
	if encrypt && bs.encryption != nil {
		encrypted, err := bs.encryption.Encrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to encrypt profiles: %w", err)
		}
		data = encrypted
	}

	// Add to zip
	filename := "profiles.json"
	if encrypt {
		filename = "profiles.json.enc"
	}

	writer, err := zipWriter.Create(filename)
	if err != nil {
		return 0, fmt.Errorf("failed to create zip entry: %w", err)
	}

	_, err = writer.Write(data)
	if err != nil {
		return 0, fmt.Errorf("failed to write profiles to zip: %w", err)
	}

	return count, nil
}

// backupTemplates backs up all form templates
func (bs *BackupService) backupTemplates(zipWriter *zip.Writer, encrypt bool) (int, error) {
	query := `
		SELECT id, url, domain, form_type, fields, selectors, validation_rules, 
		       success_rate, last_updated, version, created_at 
		FROM form_templates
	`
	rows, err := bs.db.GetDB().Query(query)
	if err != nil {
		return 0, fmt.Errorf("failed to query templates: %w", err)
	}
	defer rows.Close()

	templates := []map[string]interface{}{}
	count := 0

	for rows.Next() {
		var template map[string]interface{} = make(map[string]interface{})
		var id, url, domain, formType, fields, selectors, validationRules string
		var successRate float64
		var lastUpdated, createdAt string
		var version int

		err := rows.Scan(&id, &url, &domain, &formType, &fields, &selectors, 
			&validationRules, &successRate, &lastUpdated, &version, &createdAt)
		if err != nil {
			return 0, fmt.Errorf("failed to scan template: %w", err)
		}

		template["id"] = id
		template["url"] = url
		template["domain"] = domain
		template["form_type"] = formType
		template["fields"] = fields
		template["selectors"] = selectors
		template["validation_rules"] = validationRules
		template["success_rate"] = successRate
		template["last_updated"] = lastUpdated
		template["version"] = version
		template["created_at"] = createdAt

		templates = append(templates, template)
		count++
	}

	// Convert to JSON
	data, err := json.MarshalIndent(templates, "", "  ")
	if err != nil {
		return 0, fmt.Errorf("failed to marshal templates: %w", err)
	}

	// Encrypt if requested
	if encrypt && bs.encryption != nil {
		encrypted, err := bs.encryption.Encrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to encrypt templates: %w", err)
		}
		data = encrypted
	}

	// Add to zip
	filename := "templates.json"
	if encrypt {
		filename = "templates.json.enc"
	}

	writer, err := zipWriter.Create(filename)
	if err != nil {
		return 0, fmt.Errorf("failed to create zip entry: %w", err)
	}

	_, err = writer.Write(data)
	if err != nil {
		return 0, fmt.Errorf("failed to write templates to zip: %w", err)
	}

	return count, nil
}

// backupSessions backs up execution sessions
func (bs *BackupService) backupSessions(zipWriter *zip.Writer, encrypt bool) (int, error) {
	query := `
		SELECT id, user_id, profile_id, urls, status, start_time, end_time, results, errors, created_at 
		FROM execution_sessions 
		WHERE created_at > datetime('now', '-30 days')
	` // Only backup sessions from last 30 days

	rows, err := bs.db.GetDB().Query(query)
	if err != nil {
		return 0, fmt.Errorf("failed to query sessions: %w", err)
	}
	defer rows.Close()

	sessions := []map[string]interface{}{}
	count := 0

	for rows.Next() {
		var session map[string]interface{} = make(map[string]interface{})
		var id, userID, profileID, urls, status, startTime, results, errors, createdAt string
		var endTime sql.NullString

		err := rows.Scan(&id, &userID, &profileID, &urls, &status, &startTime, 
			&endTime, &results, &errors, &createdAt)
		if err != nil {
			return 0, fmt.Errorf("failed to scan session: %w", err)
		}

		session["id"] = id
		session["user_id"] = userID
		session["profile_id"] = profileID
		session["urls"] = urls
		session["status"] = status
		session["start_time"] = startTime
		if endTime.Valid {
			session["end_time"] = endTime.String
		}
		session["results"] = results
		session["errors"] = errors
		session["created_at"] = createdAt

		sessions = append(sessions, session)
		count++
	}

	// Convert to JSON
	data, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return 0, fmt.Errorf("failed to marshal sessions: %w", err)
	}

	// Encrypt if requested
	if encrypt && bs.encryption != nil {
		encrypted, err := bs.encryption.Encrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to encrypt sessions: %w", err)
		}
		data = encrypted
	}

	// Add to zip
	filename := "sessions.json"
	if encrypt {
		filename = "sessions.json.enc"
	}

	writer, err := zipWriter.Create(filename)
	if err != nil {
		return 0, fmt.Errorf("failed to create zip entry: %w", err)
	}

	_, err = writer.Write(data)
	if err != nil {
		return 0, fmt.Errorf("failed to write sessions to zip: %w", err)
	}

	return count, nil
}

// addMetadataToBackup adds metadata to the backup file
func (bs *BackupService) addMetadataToBackup(zipWriter *zip.Writer, metadata *BackupMetadata) error {
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	writer, err := zipWriter.Create("metadata.json")
	if err != nil {
		return fmt.Errorf("failed to create metadata entry: %w", err)
	}

	_, err = writer.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write metadata: %w", err)
	}

	return nil
}

// calculateChecksum calculates SHA256 checksum of a file
func (bs *BackupService) calculateChecksum(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("failed to calculate hash: %w", err)
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

// storeBackupMetadata stores backup metadata in the database
func (bs *BackupService) storeBackupMetadata(metadata *BackupMetadata) error {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		INSERT INTO backups (id, backup_type, file_path, file_size, checksum, created_at, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	_, err = bs.db.GetDB().Exec(query, metadata.ID, metadata.Type, metadata.FilePath,
		metadata.FileSize, metadata.Checksum, metadata.CreatedAt, string(metadataJSON))
	if err != nil {
		return fmt.Errorf("failed to store backup metadata: %w", err)
	}

	return nil
}

// ListBackups returns a list of all available backups
func (bs *BackupService) ListBackups() ([]*BackupMetadata, error) {
	query := `
		SELECT id, backup_type, file_path, file_size, checksum, created_at, metadata
		FROM backups 
		ORDER BY created_at DESC
	`

	rows, err := bs.db.GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query backups: %w", err)
	}
	defer rows.Close()

	var backups []*BackupMetadata
	for rows.Next() {
		var id, backupType, filePath, checksum, createdAt, metadataJSON string
		var fileSize int64

		err := rows.Scan(&id, &backupType, &filePath, &fileSize, &checksum, &createdAt, &metadataJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to scan backup: %w", err)
		}

		var metadata BackupMetadata
		if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
			// If metadata parsing fails, create basic metadata
			metadata = BackupMetadata{
				ID:       id,
				Type:     backupType,
				FilePath: filePath,
				FileSize: fileSize,
				Checksum: checksum,
			}
			if parsedTime, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
				metadata.CreatedAt = parsedTime
			}
		}

		backups = append(backups, &metadata)
	}

	return backups, nil
}

// RestoreBackup restores data from a backup file
func (bs *BackupService) RestoreBackup(backupID string, overwriteExisting bool) (*RestoreResult, error) {
	startTime := time.Now()
	result := &RestoreResult{
		BackupID: backupID,
		Errors:   []string{},
	}

	// Get backup metadata
	backup, err := bs.getBackupMetadata(backupID)
	if err != nil {
		return result, fmt.Errorf("failed to get backup metadata: %w", err)
	}

	// Verify backup file exists
	if _, err := os.Stat(backup.FilePath); os.IsNotExist(err) {
		return result, fmt.Errorf("backup file not found: %s", backup.FilePath)
	}

	// Verify checksum
	currentChecksum, err := bs.calculateChecksum(backup.FilePath)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to verify checksum: %v", err))
	} else if currentChecksum != backup.Checksum {
		return result, fmt.Errorf("backup file checksum mismatch")
	}

	// Open backup file
	backupFile, err := os.Open(backup.FilePath)
	if err != nil {
		return result, fmt.Errorf("failed to open backup file: %w", err)
	}
	defer backupFile.Close()

	// Open zip reader
	fileInfo, err := backupFile.Stat()
	if err != nil {
		return result, fmt.Errorf("failed to get file info: %w", err)
	}

	zipReader, err := zip.NewReader(backupFile, fileInfo.Size())
	if err != nil {
		return result, fmt.Errorf("failed to open zip reader: %w", err)
	}

	// Restore data in transaction
	err = bs.db.ExecuteInTransaction(func(tx *sql.Tx) error {
		for _, file := range zipReader.File {
			switch file.Name {
			case "profiles.json", "profiles.json.enc":
				count, err := bs.restoreProfiles(file, backup.Encrypted, overwriteExisting, tx)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to restore profiles: %v", err))
				} else {
					result.ProfilesRestored = count
				}

			case "templates.json", "templates.json.enc":
				count, err := bs.restoreTemplates(file, backup.Encrypted, overwriteExisting, tx)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to restore templates: %v", err))
				} else {
					result.TemplatesRestored = count
				}

			case "sessions.json", "sessions.json.enc":
				count, err := bs.restoreSessions(file, backup.Encrypted, overwriteExisting, tx)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to restore sessions: %v", err))
				} else {
					result.SessionsRestored = count
				}
			}
		}
		return nil
	})

	if err != nil {
		return result, fmt.Errorf("restore transaction failed: %w", err)
	}

	// Update backup metadata
	_, err = bs.db.GetDB().Exec("UPDATE backups SET restored_at = CURRENT_TIMESTAMP WHERE id = ?", backupID)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to update backup metadata: %v", err))
	}

	result.Duration = time.Since(startTime)
	return result, nil
}

// getBackupMetadata retrieves backup metadata from database
func (bs *BackupService) getBackupMetadata(backupID string) (*BackupMetadata, error) {
	query := `SELECT metadata FROM backups WHERE id = ?`
	
	var metadataJSON string
	err := bs.db.GetDB().QueryRow(query, backupID).Scan(&metadataJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to get backup metadata: %w", err)
	}

	var metadata BackupMetadata
	if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
		return nil, fmt.Errorf("failed to parse backup metadata: %w", err)
	}

	return &metadata, nil
}

// restoreProfiles restores profiles from backup
func (bs *BackupService) restoreProfiles(file *zip.File, encrypted, overwriteExisting bool, tx *sql.Tx) (int, error) {
	reader, err := file.Open()
	if err != nil {
		return 0, fmt.Errorf("failed to open profiles file: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return 0, fmt.Errorf("failed to read profiles data: %w", err)
	}

	// Decrypt if needed
	if encrypted && bs.encryption != nil {
		decrypted, err := bs.encryption.Decrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to decrypt profiles: %w", err)
		}
		data = decrypted
	}

	// Parse JSON
	var profiles []map[string]interface{}
	if err := json.Unmarshal(data, &profiles); err != nil {
		return 0, fmt.Errorf("failed to parse profiles JSON: %w", err)
	}

	// Insert profiles
	count := 0
	for _, profile := range profiles {
		query := `
			INSERT OR REPLACE INTO client_profiles 
			(id, user_id, name, personal_data, preferences, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`

		_, err := tx.Exec(query,
			profile["id"], profile["user_id"], profile["name"],
			profile["personal_data"], profile["preferences"],
			profile["created_at"], profile["updated_at"])
		if err != nil {
			return count, fmt.Errorf("failed to insert profile: %w", err)
		}
		count++
	}

	return count, nil
}

// restoreTemplates restores templates from backup
func (bs *BackupService) restoreTemplates(file *zip.File, encrypted, overwriteExisting bool, tx *sql.Tx) (int, error) {
	reader, err := file.Open()
	if err != nil {
		return 0, fmt.Errorf("failed to open templates file: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return 0, fmt.Errorf("failed to read templates data: %w", err)
	}

	// Decrypt if needed
	if encrypted && bs.encryption != nil {
		decrypted, err := bs.encryption.Decrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to decrypt templates: %w", err)
		}
		data = decrypted
	}

	// Parse JSON
	var templates []map[string]interface{}
	if err := json.Unmarshal(data, &templates); err != nil {
		return 0, fmt.Errorf("failed to parse templates JSON: %w", err)
	}

	// Insert templates
	count := 0
	for _, template := range templates {
		query := `
			INSERT OR REPLACE INTO form_templates 
			(id, url, domain, form_type, fields, selectors, validation_rules, 
			 success_rate, last_updated, version, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`

		_, err := tx.Exec(query,
			template["id"], template["url"], template["domain"], template["form_type"],
			template["fields"], template["selectors"], template["validation_rules"],
			template["success_rate"], template["last_updated"], template["version"],
			template["created_at"])
		if err != nil {
			return count, fmt.Errorf("failed to insert template: %w", err)
		}
		count++
	}

	return count, nil
}

// restoreSessions restores sessions from backup
func (bs *BackupService) restoreSessions(file *zip.File, encrypted, overwriteExisting bool, tx *sql.Tx) (int, error) {
	reader, err := file.Open()
	if err != nil {
		return 0, fmt.Errorf("failed to open sessions file: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return 0, fmt.Errorf("failed to read sessions data: %w", err)
	}

	// Decrypt if needed
	if encrypted && bs.encryption != nil {
		decrypted, err := bs.encryption.Decrypt(data)
		if err != nil {
			return 0, fmt.Errorf("failed to decrypt sessions: %w", err)
		}
		data = decrypted
	}

	// Parse JSON
	var sessions []map[string]interface{}
	if err := json.Unmarshal(data, &sessions); err != nil {
		return 0, fmt.Errorf("failed to parse sessions JSON: %w", err)
	}

	// Insert sessions
	count := 0
	for _, session := range sessions {
		query := `
			INSERT OR REPLACE INTO execution_sessions 
			(id, user_id, profile_id, urls, status, start_time, end_time, results, errors, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`

		_, err := tx.Exec(query,
			session["id"], session["user_id"], session["profile_id"], session["urls"],
			session["status"], session["start_time"], session["end_time"],
			session["results"], session["errors"], session["created_at"])
		if err != nil {
			return count, fmt.Errorf("failed to insert session: %w", err)
		}
		count++
	}

	return count, nil
}

// DeleteBackup deletes a backup file and its metadata
func (bs *BackupService) DeleteBackup(backupID string) error {
	// Get backup metadata
	backup, err := bs.getBackupMetadata(backupID)
	if err != nil {
		return fmt.Errorf("failed to get backup metadata: %w", err)
	}

	// Delete backup file
	if err := os.Remove(backup.FilePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete backup file: %w", err)
	}

	// Delete metadata from database
	_, err = bs.db.GetDB().Exec("DELETE FROM backups WHERE id = ?", backupID)
	if err != nil {
		return fmt.Errorf("failed to delete backup metadata: %w", err)
	}

	return nil
}

// CleanupOldBackups removes backups older than the specified duration
func (bs *BackupService) CleanupOldBackups(maxAge time.Duration) error {
	cutoff := time.Now().Add(-maxAge)
	
	query := `SELECT id FROM backups WHERE created_at < ?`
	rows, err := bs.db.GetDB().Query(query, cutoff.Format("2006-01-02 15:04:05"))
	if err != nil {
		return fmt.Errorf("failed to query old backups: %w", err)
	}
	defer rows.Close()

	var backupIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("failed to scan backup ID: %w", err)
		}
		backupIDs = append(backupIDs, id)
	}

	// Delete old backups
	for _, id := range backupIDs {
		if err := bs.DeleteBackup(id); err != nil {
			// Log error but continue with other backups
			fmt.Printf("Warning: failed to delete backup %s: %v\n", id, err)
		}
	}

	return nil
}