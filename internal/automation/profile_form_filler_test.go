package automation

import (
	"testing"
	"time"

	"github.com/ai-form-filler/cli/internal/models"
)

func TestProfileFormFillerConfig(t *testing.T) {
	config := DefaultProfileFormFillerConfig()

	if !config.AutoDetectFields {
		t.Error("Expected AutoDetectFields to be true")
	}

	if config.UseAIMapping {
		t.Error("Expected UseAIMapping to be false by default")
	}

	if !config.VerifySubmission {
		t.Error("Expected VerifySubmission to be true")
	}

	if config.MaxRetries != 3 {
		t.Errorf("Expected MaxRetries to be 3, got %d", config.MaxRetries)
	}

	if config.RetryDelay != 2*time.Second {
		t.Errorf("Expected RetryDelay to be 2s, got %v", config.RetryDelay)
	}
}

func TestNewProfileFormFiller(t *testing.T) {
	// Create mock dependencies (these would be real instances in actual tests)
	var formFiller *FormFiller
	var formDetector *FormDetector
	var templateManager *TemplateManager

	pff := NewProfileFormFiller(formFiller, formDetector, templateManager, nil)

	if pff == nil {
		t.Error("Expected ProfileFormFiller to be created")
	}

	if pff.config == nil {
		t.Error("Expected config to be set")
	}

	if pff.fieldMapper == nil {
		t.Error("Expected fieldMapper to be initialized")
	}
}

func TestConvertToProfileData(t *testing.T) {
	pff := &ProfileFormFiller{}

	profile := &models.ClientProfile{
		ID:   "test-profile",
		Name: "Test Profile",
		PersonalData: models.PersonalData{
			FirstName: "John",
			LastName:  "Doe",
			Email:     "john.doe@example.com",
			Phone:     "+1234567890",
			Address: models.Address{
				Street1:    "123 Main St",
				City:       "Anytown",
				State:      "CA",
				PostalCode: "12345",
				Country:    "USA",
			},
		},
	}

	profileData := pff.convertToProfileData(profile)

	if profileData.FirstName != "John" {
		t.Errorf("Expected FirstName to be 'John', got %s", profileData.FirstName)
	}

	if profileData.LastName != "Doe" {
		t.Errorf("Expected LastName to be 'Doe', got %s", profileData.LastName)
	}

	if profileData.Email != "john.doe@example.com" {
		t.Errorf("Expected Email to be 'john.doe@example.com', got %s", profileData.Email)
	}

	if profileData.Phone != "+1234567890" {
		t.Errorf("Expected Phone to be '+1234567890', got %s", profileData.Phone)
	}

	if profileData.Address.Street != "123 Main St" {
		t.Errorf("Expected Street to be '123 Main St', got %s", profileData.Address.Street)
	}

	if profileData.Address.City != "Anytown" {
		t.Errorf("Expected City to be 'Anytown', got %s", profileData.Address.City)
	}
}

func TestCalculateMappingConfidence(t *testing.T) {
	pff := &ProfileFormFiller{}

	fields := []FormField{
		{Name: "firstName", Type: "text"},
		{Name: "lastName", Type: "text"},
		{Name: "email", Type: "email"},
		{Name: "phone", Type: "tel"},
	}

	// Test full mapping
	fullMappings := map[string]string{
		"firstName": "John",
		"lastName":  "Doe",
		"email":     "john@example.com",
		"phone":     "1234567890",
	}

	confidence := pff.calculateMappingConfidence(fullMappings, fields)
	if confidence != 100.0 {
		t.Errorf("Expected confidence to be 100.0 for full mapping, got %f", confidence)
	}

	// Test partial mapping
	partialMappings := map[string]string{
		"firstName": "John",
		"email":     "john@example.com",
	}

	confidence = pff.calculateMappingConfidence(partialMappings, fields)
	expected := 50.0 // 2 out of 4 fields mapped
	if confidence != expected {
		t.Errorf("Expected confidence to be %f for partial mapping, got %f", expected, confidence)
	}

	// Test no mapping
	noMappings := map[string]string{}

	confidence = pff.calculateMappingConfidence(noMappings, fields)
	if confidence != 0.0 {
		t.Errorf("Expected confidence to be 0.0 for no mapping, got %f", confidence)
	}

	// Test empty fields
	confidence = pff.calculateMappingConfidence(fullMappings, []FormField{})
	if confidence != 0.0 {
		t.Errorf("Expected confidence to be 0.0 for empty fields, got %f", confidence)
	}
}

func TestNewFieldMapper(t *testing.T) {
	fm := NewFieldMapper()

	if fm == nil {
		t.Error("Expected FieldMapper to be created")
	}

	if fm.fieldPatterns == nil {
		t.Error("Expected fieldPatterns to be initialized")
	}

	// Check that patterns are initialized
	if len(fm.fieldPatterns) == 0 {
		t.Error("Expected fieldPatterns to contain patterns")
	}

	// Check specific patterns exist
	expectedFields := []string{"firstName", "lastName", "email", "phone", "address", "city", "state", "zipCode", "country"}
	for _, field := range expectedFields {
		if _, exists := fm.fieldPatterns[field]; !exists {
			t.Errorf("Expected pattern for field %s to exist", field)
		}
	}
}

func TestFieldMapperMatchesField(t *testing.T) {
	fm := NewFieldMapper()

	testCases := []struct {
		field        FormField
		profileField string
		shouldMatch  bool
	}{
		// First name tests
		{FormField{Name: "firstName", Type: "text"}, "firstName", true},
		{FormField{Name: "fname", Type: "text"}, "firstName", true},
		{FormField{Name: "first_name", Type: "text"}, "firstName", true},
		{FormField{Label: "First Name", Type: "text"}, "firstName", true},
		{FormField{Name: "lastName", Type: "text"}, "firstName", false},

		// Email tests
		{FormField{Name: "email", Type: "email"}, "email", true},
		{FormField{Name: "e-mail", Type: "text"}, "email", true},
		{FormField{Type: "email"}, "email", true}, // Type-based matching
		{FormField{Name: "phone", Type: "text"}, "email", false},

		// Phone tests
		{FormField{Name: "phone", Type: "tel"}, "phone", true},
		{FormField{Name: "telephone", Type: "text"}, "phone", true},
		{FormField{Type: "tel"}, "phone", true}, // Type-based matching
		{FormField{Name: "email", Type: "text"}, "phone", false},
	}

	for _, tc := range testCases {
		result := fm.matchesField(tc.field, tc.profileField)
		if result != tc.shouldMatch {
			t.Errorf("Field %+v with profile field %s: expected %v, got %v",
				tc.field, tc.profileField, tc.shouldMatch, result)
		}
	}
}

func TestFieldMapperMapProfileToFields(t *testing.T) {
	fm := NewFieldMapper()

	profile := &models.ClientProfile{
		PersonalData: models.PersonalData{
			FirstName: "John",
			LastName:  "Doe",
			Email:     "john.doe@example.com",
			Phone:     "+1234567890",
			Address: models.Address{
				Street1:    "123 Main St",
				City:       "Anytown",
				State:      "CA",
				PostalCode: "12345",
				Country:    "USA",
			},
		},
	}

	fields := []FormField{
		{Name: "firstName", Type: "text", Label: "First Name"},
		{Name: "lastName", Type: "text", Label: "Last Name"},
		{Name: "email", Type: "email", Label: "Email Address"},
		{Name: "phone", Type: "tel", Label: "Phone Number"},
		{Name: "unknownField", Type: "text", Label: "Unknown"},
	}

	mappings, unmappedFields := fm.MapProfileToFields(profile, fields)

	// Check expected mappings
	expectedMappings := map[string]string{
		"firstName": "John",
		"lastName":  "Doe",
		"email":     "john.doe@example.com",
		"phone":     "+1234567890",
	}

	for field, expectedValue := range expectedMappings {
		if mappedValue, exists := mappings[field]; !exists {
			t.Errorf("Expected field %s to be mapped", field)
		} else if mappedValue != expectedValue {
			t.Errorf("Expected field %s to be mapped to %s, got %s", field, expectedValue, mappedValue)
		}
	}

	// Check unmapped fields
	if len(unmappedFields) != 1 || unmappedFields[0] != "unknownField" {
		t.Errorf("Expected unmappedFields to contain 'unknownField', got %v", unmappedFields)
	}
}

func TestFieldMapperHandleSpecialField(t *testing.T) {
	fm := NewFieldMapper()

	profile := &models.ClientProfile{
		PersonalData: models.PersonalData{
			FirstName:   "John",
			LastName:    "Doe",
			DateOfBirth: "1990-01-01",
			CustomFields: map[string]interface{}{
				"company": "Acme Corp",
				"title":   "Developer",
			},
		},
	}

	testCases := []struct {
		field    FormField
		expected string
	}{
		// Full name field
		{FormField{Name: "fullName", Type: "text"}, "John Doe"},
		{FormField{Label: "Full Name", Type: "text"}, "John Doe"},

		// Generic name field
		{FormField{Name: "name", Type: "text"}, "John Doe"},

		// Date of birth
		{FormField{Name: "dateOfBirth", Type: "date"}, "1990-01-01"},
		{FormField{Name: "dob", Type: "text"}, "1990-01-01"},
		{FormField{Label: "Date of Birth", Type: "date"}, "1990-01-01"},

		// Custom fields
		{FormField{Name: "company", Type: "text"}, "Acme Corp"},
		{FormField{Name: "jobTitle", Type: "text"}, "Developer"},

		// Non-matching field
		{FormField{Name: "unknown", Type: "text"}, ""},
	}

	for _, tc := range testCases {
		result := fm.handleSpecialField(tc.field, profile)
		if result != tc.expected {
			t.Errorf("Field %+v: expected %s, got %s", tc.field, tc.expected, result)
		}
	}
}

func TestFieldMapperValidateFieldMapping(t *testing.T) {
	fm := NewFieldMapper()

	fields := []FormField{
		{Name: "email", Type: "email", Required: true},
		{Name: "phone", Type: "tel", Required: false},
		{Name: "firstName", Type: "text", Required: true},
		{Name: "lastName", Type: "text", Required: false},
	}

	testCases := []struct {
		mappings        map[string]string
		expectedWarnings int
		description     string
	}{
		// Valid mappings
		{
			mappings: map[string]string{
				"email":     "john@example.com",
				"phone":     "+1234567890",
				"firstName": "John",
				"lastName":  "Doe",
			},
			expectedWarnings: 0,
			description:     "Valid mappings",
		},

		// Invalid email
		{
			mappings: map[string]string{
				"email":     "invalid-email",
				"firstName": "John",
			},
			expectedWarnings: 1,
			description:     "Invalid email format",
		},

		// Invalid phone
		{
			mappings: map[string]string{
				"email": "john@example.com",
				"phone": "invalid-phone!@#",
				"firstName": "John",
			},
			expectedWarnings: 1,
			description:     "Invalid phone format",
		},

		// Missing required field
		{
			mappings: map[string]string{
				"phone":    "+1234567890",
				"lastName": "Doe",
			},
			expectedWarnings: 2, // Missing email and firstName (both required)
			description:     "Missing required fields",
		},

		// Empty required field
		{
			mappings: map[string]string{
				"email":     "",
				"firstName": "John",
			},
			expectedWarnings: 1, // Empty email (required)
			description:     "Empty required field",
		},
	}

	for _, tc := range testCases {
		warnings := fm.ValidateFieldMapping(tc.mappings, fields)
		if len(warnings) != tc.expectedWarnings {
			t.Errorf("%s: expected %d warnings, got %d. Warnings: %v",
				tc.description, tc.expectedWarnings, len(warnings), warnings)
		}
	}
}

func TestSubmissionResult(t *testing.T) {
	result := &SubmissionResult{
		Success:        true,
		SubmissionTime: 2 * time.Second,
		RedirectURL:    "https://example.com/success",
		SuccessIndicators: []string{"Thank you for your submission"},
		ErrorMessages:     []string{},
	}

	if !result.Success {
		t.Error("Expected Success to be true")
	}

	if result.SubmissionTime != 2*time.Second {
		t.Errorf("Expected SubmissionTime to be 2s, got %v", result.SubmissionTime)
	}

	if result.RedirectURL != "https://example.com/success" {
		t.Errorf("Expected RedirectURL to be 'https://example.com/success', got %s", result.RedirectURL)
	}

	if len(result.SuccessIndicators) != 1 {
		t.Errorf("Expected 1 success indicator, got %d", len(result.SuccessIndicators))
	}

	if len(result.ErrorMessages) != 0 {
		t.Errorf("Expected 0 error messages, got %d", len(result.ErrorMessages))
	}
}

func TestProfileFillResult(t *testing.T) {
	fillResult := &FillResult{
		Success:     true,
		FilledFields: 4,
		TotalFields:  5,
		SuccessRate: 80.0,
	}

	result := &ProfileFillResult{
		FillResult:    fillResult,
		ProfileID:     "test-profile-123",
		FieldMappings: map[string]string{
			"firstName": "John",
			"lastName":  "Doe",
		},
		UnmappedFields: []string{"middleName"},
		Confidence:     75.0,
	}

	if result.ProfileID != "test-profile-123" {
		t.Errorf("Expected ProfileID to be 'test-profile-123', got %s", result.ProfileID)
	}

	if len(result.FieldMappings) != 2 {
		t.Errorf("Expected 2 field mappings, got %d", len(result.FieldMappings))
	}

	if len(result.UnmappedFields) != 1 {
		t.Errorf("Expected 1 unmapped field, got %d", len(result.UnmappedFields))
	}

	if result.Confidence != 75.0 {
		t.Errorf("Expected Confidence to be 75.0, got %f", result.Confidence)
	}

	// Test inherited fields from FillResult
	if !result.Success {
		t.Error("Expected Success to be true")
	}

	if result.FilledFields != 4 {
		t.Errorf("Expected FilledFields to be 4, got %d", result.FilledFields)
	}
}