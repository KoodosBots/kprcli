package services

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/ai-form-filler/cli/internal/models"
)

// ProfileService implements the profile management interface
type ProfileService struct {
	dataDir    string
	encryptKey []byte
	profiles   map[string]*models.ClientProfile
	mutex      sync.RWMutex
}

// NewProfileService creates a new profile service
func NewProfileService(dataDir string) (*ProfileService, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Generate or load encryption key
	encryptKey, err := getOrCreateEncryptionKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to setup encryption: %w", err)
	}

	service := &ProfileService{
		dataDir:    dataDir,
		encryptKey: encryptKey,
		profiles:   make(map[string]*models.ClientProfile),
	}

	// Load existing profiles
	if err := service.loadProfiles(); err != nil {
		return nil, fmt.Errorf("failed to load profiles: %w", err)
	}

	return service, nil
}

// GetProfiles returns all profiles
func (s *ProfileService) GetProfiles() ([]interface{}, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	profiles := make([]interface{}, 0, len(s.profiles))
	for _, profile := range s.profiles {
		profiles = append(profiles, profile)
	}
	return profiles, nil
}

// CreateProfile creates a new profile
func (s *ProfileService) CreateProfile(data map[string]interface{}) (interface{}, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Extract name from data
	name, ok := data["name"].(string)
	if !ok || name == "" {
		return nil, fmt.Errorf("profile name is required")
	}

	// Create new profile
	profile := models.NewClientProfile(name)

	// Update profile with provided data
	if err := s.updateProfileFromMap(profile, data); err != nil {
		return nil, fmt.Errorf("failed to update profile data: %w", err)
	}

	// Validate profile
	if err := profile.Validate(); err != nil {
		return nil, fmt.Errorf("profile validation failed: %w", err)
	}

	// Save profile
	if err := s.saveProfile(profile); err != nil {
		return nil, fmt.Errorf("failed to save profile: %w", err)
	}

	s.profiles[profile.ID] = profile
	return profile, nil
}

// UpdateProfile updates an existing profile
func (s *ProfileService) UpdateProfile(data map[string]interface{}) (interface{}, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	profileID, ok := data["id"].(string)
	if !ok || profileID == "" {
		return nil, fmt.Errorf("profile ID is required")
	}

	profile, exists := s.profiles[profileID]
	if !exists {
		return nil, fmt.Errorf("profile not found")
	}

	// Clone profile for update
	updatedProfile := profile.Clone()

	// Update profile with provided data
	if err := s.updateProfileFromMap(updatedProfile, data); err != nil {
		return nil, fmt.Errorf("failed to update profile data: %w", err)
	}

	// Validate updated profile
	if err := updatedProfile.Validate(); err != nil {
		return nil, fmt.Errorf("profile validation failed: %w", err)
	}

	// Update timestamp
	updatedProfile.Update()

	// Save updated profile
	if err := s.saveProfile(updatedProfile); err != nil {
		return nil, fmt.Errorf("failed to save profile: %w", err)
	}

	s.profiles[profileID] = updatedProfile
	return updatedProfile, nil
}

// DeleteProfile deletes a profile
func (s *ProfileService) DeleteProfile(profileID string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if _, exists := s.profiles[profileID]; !exists {
		return fmt.Errorf("profile not found")
	}

	// Remove profile file
	profilePath := filepath.Join(s.dataDir, fmt.Sprintf("profile_%s.enc", profileID))
	if err := os.Remove(profilePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove profile file: %w", err)
	}

	delete(s.profiles, profileID)
	return nil
}

// GetProfile returns a specific profile
func (s *ProfileService) GetProfile(profileID string) (interface{}, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	profile, exists := s.profiles[profileID]
	if !exists {
		return nil, fmt.Errorf("profile not found")
	}

	return profile, nil
}

// GetProfileByName returns a profile by name
func (s *ProfileService) GetProfileByName(name string) (*models.ClientProfile, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	for _, profile := range s.profiles {
		if profile.Name == name {
			return profile, nil
		}
	}
	return nil, fmt.Errorf("profile not found")
}

// ListProfileNames returns a list of profile names
func (s *ProfileService) ListProfileNames() []string {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	names := make([]string, 0, len(s.profiles))
	for _, profile := range s.profiles {
		names = append(names, profile.Name)
	}
	return names
}

// saveProfile saves a profile to disk with encryption
func (s *ProfileService) saveProfile(profile *models.ClientProfile) error {
	encryptedData, err := profile.Encrypt(s.encryptKey)
	if err != nil {
		return fmt.Errorf("failed to encrypt profile: %w", err)
	}

	profilePath := filepath.Join(s.dataDir, fmt.Sprintf("profile_%s.enc", profile.ID))
	if err := os.WriteFile(profilePath, encryptedData, 0600); err != nil {
		return fmt.Errorf("failed to write profile file: %w", err)
	}

	return nil
}

// loadProfiles loads all profiles from disk
func (s *ProfileService) loadProfiles() error {
	files, err := filepath.Glob(filepath.Join(s.dataDir, "profile_*.enc"))
	if err != nil {
		return fmt.Errorf("failed to glob profile files: %w", err)
	}

	for _, file := range files {
		encryptedData, err := os.ReadFile(file)
		if err != nil {
			continue // Skip corrupted files
		}

		profile, err := models.DecryptProfile(encryptedData, s.encryptKey)
		if err != nil {
			continue // Skip corrupted files
		}

		s.profiles[profile.ID] = profile
	}

	return nil
}

// updateProfileFromMap updates profile fields from a map
func (s *ProfileService) updateProfileFromMap(profile *models.ClientProfile, data map[string]interface{}) error {
	if name, ok := data["name"].(string); ok {
		profile.Name = name
	}

	// Update personal data
	if personalData, ok := data["personalData"].(map[string]interface{}); ok {
		if firstName, ok := personalData["firstName"].(string); ok {
			profile.PersonalData.FirstName = firstName
		}
		if lastName, ok := personalData["lastName"].(string); ok {
			profile.PersonalData.LastName = lastName
		}
		if email, ok := personalData["email"].(string); ok {
			profile.PersonalData.Email = email
		}
		if phone, ok := personalData["phone"].(string); ok {
			profile.PersonalData.Phone = phone
		}
		if dateOfBirth, ok := personalData["dateOfBirth"].(string); ok {
			profile.PersonalData.DateOfBirth = dateOfBirth
		}

		// Update address
		if address, ok := personalData["address"].(map[string]interface{}); ok {
			if street1, ok := address["street1"].(string); ok {
				profile.PersonalData.Address.Street1 = street1
			}
			if street2, ok := address["street2"].(string); ok {
				profile.PersonalData.Address.Street2 = street2
			}
			if city, ok := address["city"].(string); ok {
				profile.PersonalData.Address.City = city
			}
			if state, ok := address["state"].(string); ok {
				profile.PersonalData.Address.State = state
			}
			if postalCode, ok := address["postalCode"].(string); ok {
				profile.PersonalData.Address.PostalCode = postalCode
			}
			if country, ok := address["country"].(string); ok {
				profile.PersonalData.Address.Country = country
			}
		}
	}

	// Update preferences
	if preferences, ok := data["preferences"].(map[string]interface{}); ok {
		if autoFill, ok := preferences["autoFill"].(bool); ok {
			profile.Preferences.AutoFill = autoFill
		}
		if skipValidation, ok := preferences["skipValidation"].(bool); ok {
			profile.Preferences.SkipValidation = skipValidation
		}
		if defaultTimeout, ok := preferences["defaultTimeout"].(float64); ok {
			profile.Preferences.DefaultTimeout = int(defaultTimeout)
		}
		if preferredBrowser, ok := preferences["preferredBrowser"].(string); ok {
			profile.Preferences.PreferredBrowser = preferredBrowser
		}
	}

	return nil
}

// getOrCreateEncryptionKey gets or creates an encryption key
func getOrCreateEncryptionKey(dataDir string) ([]byte, error) {
	keyPath := filepath.Join(dataDir, ".key")
	
	// Try to load existing key
	if key, err := os.ReadFile(keyPath); err == nil {
		if len(key) == 32 {
			return key, nil
		}
	}

	// Generate new key
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}

	// Save key
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return nil, fmt.Errorf("failed to save encryption key: %w", err)
	}

	return key, nil
}