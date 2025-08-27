package automation

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/ai-form-filler/cli/internal/models"
	"github.com/playwright-community/playwright-go"
)

// ProfileFormFiller handles form filling using client profiles with intelligent field mapping
type ProfileFormFiller struct {
	formFiller     *FormFiller
	formDetector   *FormDetector
	templateManager *TemplateManager
	fieldMapper    *FieldMapper
	config         *ProfileFormFillerConfig
}

// ProfileFormFillerConfig holds configuration for profile-based form filling
type ProfileFormFillerConfig struct {
	AutoDetectFields    bool
	UseAIMapping        bool
	VerifySubmission    bool
	MaxRetries          int
	RetryDelay          time.Duration
	SubmissionTimeout   time.Duration
	FieldMappingTimeout time.Duration
}

// DefaultProfileFormFillerConfig returns sensible defaults
func DefaultProfileFormFillerConfig() *ProfileFormFillerConfig {
	return &ProfileFormFillerConfig{
		AutoDetectFields:    true,
		UseAIMapping:        false, // Will be enabled when AI integration is added
		VerifySubmission:    true,
		MaxRetries:          3,
		RetryDelay:          2 * time.Second,
		SubmissionTimeout:   30 * time.Second,
		FieldMappingTimeout: 10 * time.Second,
	}
}

// ProfileFillResult represents the result of profile-based form filling
type ProfileFillResult struct {
	*FillResult
	ProfileID       string                 `json:"profileId"`
	TemplateUsed    *FormTemplate          `json:"templateUsed,omitempty"`
	FieldMappings   map[string]string      `json:"fieldMappings"`
	UnmappedFields  []string               `json:"unmappedFields"`
	SubmissionResult *SubmissionResult     `json:"submissionResult,omitempty"`
	Confidence      float64                `json:"confidence"`
}

// SubmissionResult represents the result of form submission
type SubmissionResult struct {
	Success         bool          `json:"success"`
	SubmissionTime  time.Duration `json:"submissionTime"`
	RedirectURL     string        `json:"redirectUrl,omitempty"`
	SuccessIndicators []string    `json:"successIndicators"`
	ErrorMessages   []string      `json:"errorMessages"`
	StatusCode      int           `json:"statusCode,omitempty"`
}

// NewProfileFormFiller creates a new profile-based form filler
func NewProfileFormFiller(
	formFiller *FormFiller,
	formDetector *FormDetector,
	templateManager *TemplateManager,
	config *ProfileFormFillerConfig,
) *ProfileFormFiller {
	if config == nil {
		config = DefaultProfileFormFillerConfig()
	}

	return &ProfileFormFiller{
		formFiller:      formFiller,
		formDetector:    formDetector,
		templateManager: templateManager,
		fieldMapper:     NewFieldMapper(),
		config:          config,
	}
}

// FillFormWithProfile fills a form using a client profile
func (pff *ProfileFormFiller) FillFormWithProfile(
	ctx context.Context,
	pageURL string,
	profile *models.ClientProfile,
) (*ProfileFillResult, error) {
	startTime := time.Now()

	// Try to find existing template first
	template, err := pff.templateManager.FindBestTemplate(pageURL)
	if err != nil && pff.config.AutoDetectFields {
		// No template found, analyze the page to create one
		analysis, err := pff.formDetector.AnalyzePage(ctx, pageURL)
		if err != nil {
			return nil, fmt.Errorf("failed to analyze page: %w", err)
		}

		if len(analysis.Forms) == 0 {
			return nil, fmt.Errorf("no forms detected on page: %s", pageURL)
		}

		// Use the form with highest confidence
		bestForm := analysis.Forms[0]
		template, err = pff.formDetector.GenerateFormTemplate(bestForm, pageURL)
		if err != nil {
			return nil, fmt.Errorf("failed to generate template: %w", err)
		}

		// Save the new template
		if err := pff.templateManager.SaveTemplate(template); err != nil {
			// Log error but continue - template saving is not critical for filling
			fmt.Printf("Warning: failed to save template: %v\n", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("no template found and auto-detection disabled: %w", err)
	}

	// Map profile data to form fields
	fieldMappings, unmappedFields := pff.fieldMapper.MapProfileToFields(profile, template.Fields)

	// Create ProfileData for the form filler
	profileData := pff.convertToProfileData(profile)

	// Fill the form
	fillResult, err := pff.formFiller.FillForm(ctx, template, profileData)
	if err != nil {
		return nil, fmt.Errorf("failed to fill form: %w", err)
	}

	// Calculate confidence based on mapping success
	confidence := pff.calculateMappingConfidence(fieldMappings, template.Fields)

	result := &ProfileFillResult{
		FillResult:     fillResult,
		ProfileID:      profile.ID,
		TemplateUsed:   template,
		FieldMappings:  fieldMappings,
		UnmappedFields: unmappedFields,
		Confidence:     confidence,
	}

	// Submit form if configured to do so
	if pff.config.VerifySubmission && fillResult.Success {
		submissionResult, err := pff.submitAndVerify(ctx, template, pageURL)
		if err != nil {
			// Log error but don't fail the entire operation
			fmt.Printf("Warning: form submission failed: %v\n", err)
		} else {
			result.SubmissionResult = submissionResult
		}
	}

	// Update template success rate
	successRate := 0.0
	if fillResult.Success {
		successRate = fillResult.SuccessRate
		if result.SubmissionResult != nil && result.SubmissionResult.Success {
			successRate = 100.0
		}
	}

	if err := pff.templateManager.UpdateTemplateSuccess(template.ID, successRate); err != nil {
		fmt.Printf("Warning: failed to update template success rate: %v\n", err)
	}

	result.ExecutionTime = time.Since(startTime)
	return result, nil
}

// convertToProfileData converts a ClientProfile to ProfileData for the form filler
func (pff *ProfileFormFiller) convertToProfileData(profile *models.ClientProfile) *ProfileData {
	return &ProfileData{
		FirstName: profile.PersonalData.FirstName,
		LastName:  profile.PersonalData.LastName,
		Email:     profile.PersonalData.Email,
		Phone:     profile.PersonalData.Phone,
		Address: Address{
			Street:  profile.PersonalData.Address.Street1,
			City:    profile.PersonalData.Address.City,
			State:   profile.PersonalData.Address.State,
			ZipCode: profile.PersonalData.Address.PostalCode,
			Country: profile.PersonalData.Address.Country,
		},
	}
}

// calculateMappingConfidence calculates confidence based on how many fields were successfully mapped
func (pff *ProfileFormFiller) calculateMappingConfidence(mappings map[string]string, fields []FormField) float64 {
	if len(fields) == 0 {
		return 0.0
	}

	mappedCount := 0
	for _, field := range fields {
		if _, mapped := mappings[field.Name]; mapped {
			mappedCount++
		}
	}

	return float64(mappedCount) / float64(len(fields)) * 100.0
}

// submitAndVerify submits the form and verifies successful submission
func (pff *ProfileFormFiller) submitAndVerify(ctx context.Context, template *FormTemplate, pageURL string) (*SubmissionResult, error) {
	// Create a new page for submission
	page, err := pff.formFiller.browserManager.CreatePage(DefaultBrowserConfig())
	if err != nil {
		return nil, fmt.Errorf("failed to create page for submission: %w", err)
	}
	defer (*page).Close()

	// Navigate to the page
	_, err = (*page).Goto(pageURL, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
		Timeout:   playwright.Float(float64(pff.config.SubmissionTimeout.Milliseconds())),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to navigate to page: %w", err)
	}

	startTime := time.Now()

	// Submit the form
	err = pff.formFiller.SubmitForm(ctx, page, template)
	if err != nil {
		return &SubmissionResult{
			Success:        false,
			SubmissionTime: time.Since(startTime),
			ErrorMessages:  []string{err.Error()},
		}, nil
	}

	// Wait for navigation or response
	time.Sleep(2 * time.Second)

	// Get current URL to check for redirect
	currentURL := (*page).URL()

	// Check for success indicators
	successIndicators, errorMessages := pff.checkSubmissionResult(ctx, page)

	success := len(errorMessages) == 0 && (currentURL != pageURL || len(successIndicators) > 0)

	return &SubmissionResult{
		Success:           success,
		SubmissionTime:    time.Since(startTime),
		RedirectURL:       currentURL,
		SuccessIndicators: successIndicators,
		ErrorMessages:     errorMessages,
	}, nil
}

// checkSubmissionResult checks the page for success or error indicators
func (pff *ProfileFormFiller) checkSubmissionResult(ctx context.Context, page *playwright.Page) ([]string, []string) {
	var successIndicators []string
	var errorMessages []string

	// Common success indicators
	successSelectors := []string{
		".success", ".alert-success", ".message-success",
		"[class*='success']", "[id*='success']",
		".confirmation", ".thank-you", ".complete",
	}

	// Common error indicators
	errorSelectors := []string{
		".error", ".alert-error", ".message-error",
		"[class*='error']", "[id*='error']",
		".warning", ".alert-warning", ".invalid",
	}

	// Check for success indicators
	for _, selector := range successSelectors {
		elements, err := (*page).QuerySelectorAll(selector)
		if err != nil {
			continue
		}

		for _, element := range elements {
			text, err := element.TextContent()
			if err != nil {
				continue
			}
			if text != "" && strings.TrimSpace(text) != "" {
				successIndicators = append(successIndicators, strings.TrimSpace(text))
			}
		}
	}

	// Check for error indicators
	for _, selector := range errorSelectors {
		elements, err := (*page).QuerySelectorAll(selector)
		if err != nil {
			continue
		}

		for _, element := range elements {
			text, err := element.TextContent()
			if err != nil {
				continue
			}
			if text != "" && strings.TrimSpace(text) != "" {
				errorMessages = append(errorMessages, strings.TrimSpace(text))
			}
		}
	}

	// Check page title for success/error keywords
	title, err := (*page).Title()
	if err == nil {
		lowerTitle := strings.ToLower(title)
		if strings.Contains(lowerTitle, "success") || strings.Contains(lowerTitle, "thank") || strings.Contains(lowerTitle, "complete") {
			successIndicators = append(successIndicators, fmt.Sprintf("Title: %s", title))
		}
		if strings.Contains(lowerTitle, "error") || strings.Contains(lowerTitle, "failed") {
			errorMessages = append(errorMessages, fmt.Sprintf("Title: %s", title))
		}
	}

	return successIndicators, errorMessages
}

// FieldMapper handles mapping between profile data and form fields
type FieldMapper struct {
	fieldPatterns map[string][]*regexp.Regexp
}

// NewFieldMapper creates a new field mapper with predefined patterns
func NewFieldMapper() *FieldMapper {
	fm := &FieldMapper{
		fieldPatterns: make(map[string][]*regexp.Regexp),
	}

	// Initialize field mapping patterns
	fm.initializePatterns()
	return fm
}

// initializePatterns sets up regex patterns for field mapping
func (fm *FieldMapper) initializePatterns() {
	patterns := map[string][]string{
		"firstName": {
			`(?i)first.*name`, `(?i)fname`, `(?i)given.*name`,
			`(?i)forename`, `(?i)prenom`, `(?i)nombre`,
		},
		"lastName": {
			`(?i)last.*name`, `(?i)lname`, `(?i)surname`,
			`(?i)family.*name`, `(?i)apellido`, `(?i)nom`,
		},
		"email": {
			`(?i)email`, `(?i)e.mail`, `(?i)mail`,
			`(?i)correo`, `(?i)courriel`,
		},
		"phone": {
			`(?i)phone`, `(?i)tel`, `(?i)mobile`, `(?i)cell`,
			`(?i)telefono`, `(?i)telephone`, `(?i)numero`,
		},
		"address": {
			`(?i)address`, `(?i)street`, `(?i)addr`,
			`(?i)direccion`, `(?i)adresse`, `(?i)rue`,
		},
		"city": {
			`(?i)city`, `(?i)town`, `(?i)ciudad`,
			`(?i)ville`, `(?i)locality`,
		},
		"state": {
			`(?i)state`, `(?i)province`, `(?i)region`,
			`(?i)estado`, `(?i)provincia`, `(?i)departement`,
		},
		"zipCode": {
			`(?i)zip`, `(?i)postal`, `(?i)postcode`,
			`(?i)codigo.*postal`, `(?i)code.*postal`,
		},
		"country": {
			`(?i)country`, `(?i)nation`, `(?i)pais`,
			`(?i)pays`, `(?i)nationality`,
		},
	}

	for fieldType, patternStrings := range patterns {
		var regexps []*regexp.Regexp
		for _, pattern := range patternStrings {
			if regex, err := regexp.Compile(pattern); err == nil {
				regexps = append(regexps, regex)
			}
		}
		fm.fieldPatterns[fieldType] = regexps
	}
}

// MapProfileToFields maps profile data to form fields based on field names and labels
func (fm *FieldMapper) MapProfileToFields(profile *models.ClientProfile, fields []FormField) (map[string]string, []string) {
	mappings := make(map[string]string)
	var unmappedFields []string

	profileData := map[string]string{
		"firstName": profile.PersonalData.FirstName,
		"lastName":  profile.PersonalData.LastName,
		"email":     profile.PersonalData.Email,
		"phone":     profile.PersonalData.Phone,
		"address":   profile.PersonalData.Address.Street1,
		"city":      profile.PersonalData.Address.City,
		"state":     profile.PersonalData.Address.State,
		"zipCode":   profile.PersonalData.Address.PostalCode,
		"country":   profile.PersonalData.Address.Country,
	}

	for _, field := range fields {
		mapped := false

		// Try to map based on field name and label
		for profileField, value := range profileData {
			if value == "" {
				continue // Skip empty profile values
			}

			if fm.matchesField(field, profileField) {
				mappings[field.Name] = value
				mapped = true
				break
			}
		}

		// Handle special cases
		if !mapped {
			if specialValue := fm.handleSpecialField(field, profile); specialValue != "" {
				mappings[field.Name] = specialValue
				mapped = true
			}
		}

		if !mapped {
			unmappedFields = append(unmappedFields, field.Name)
		}
	}

	return mappings, unmappedFields
}

// matchesField checks if a form field matches a profile field type
func (fm *FieldMapper) matchesField(field FormField, profileFieldType string) bool {
	patterns, exists := fm.fieldPatterns[profileFieldType]
	if !exists {
		return false
	}

	// Check field name
	for _, pattern := range patterns {
		if pattern.MatchString(field.Name) {
			return true
		}
	}

	// Check field label
	for _, pattern := range patterns {
		if pattern.MatchString(field.Label) {
			return true
		}
	}

	// Check field type for email and tel
	if profileFieldType == "email" && field.Type == "email" {
		return true
	}
	if profileFieldType == "phone" && (field.Type == "tel" || field.Type == "phone") {
		return true
	}

	return false
}

// handleSpecialField handles special field types that need custom logic
func (fm *FieldMapper) handleSpecialField(field FormField, profile *models.ClientProfile) string {
	fieldName := strings.ToLower(field.Name)
	fieldLabel := strings.ToLower(field.Label)

	// Handle full name fields
	if strings.Contains(fieldName, "fullname") || strings.Contains(fieldLabel, "full name") {
		return fmt.Sprintf("%s %s", profile.PersonalData.FirstName, profile.PersonalData.LastName)
	}

	// Handle name fields (could be first or last)
	if fieldName == "name" || fieldLabel == "name" {
		// If it's the only name field, use full name
		return fmt.Sprintf("%s %s", profile.PersonalData.FirstName, profile.PersonalData.LastName)
	}

	// Handle date of birth
	if strings.Contains(fieldName, "birth") || strings.Contains(fieldLabel, "birth") ||
		strings.Contains(fieldName, "dob") || strings.Contains(fieldLabel, "date of birth") {
		return profile.PersonalData.DateOfBirth
	}

	// Handle custom fields
	for key, value := range profile.PersonalData.CustomFields {
		if strings.Contains(fieldName, strings.ToLower(key)) || strings.Contains(fieldLabel, strings.ToLower(key)) {
			if strValue, ok := value.(string); ok {
				return strValue
			}
		}
	}

	return ""
}

// ValidateFieldMapping validates that field mappings are appropriate
func (fm *FieldMapper) ValidateFieldMapping(mappings map[string]string, fields []FormField) []string {
	var warnings []string

	for _, field := range fields {
		if value, mapped := mappings[field.Name]; mapped {
			// Check required fields first
			if field.Required && strings.TrimSpace(value) == "" {
				warnings = append(warnings, fmt.Sprintf("Required field %s is empty", field.Name))
				continue
			}

			// Skip validation for empty non-required fields
			if strings.TrimSpace(value) == "" {
				continue
			}

			// Validate email format
			if field.Type == "email" {
				emailRegex := regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
				if !emailRegex.MatchString(value) {
					warnings = append(warnings, fmt.Sprintf("Invalid email format for field %s: %s", field.Name, value))
				}
			}

			// Validate phone format (basic check)
			if field.Type == "tel" || field.Type == "phone" {
				phoneRegex := regexp.MustCompile(`^[\d\s\-\(\)\+]+$`)
				if !phoneRegex.MatchString(value) {
					warnings = append(warnings, fmt.Sprintf("Invalid phone format for field %s: %s", field.Name, value))
				}
			}
		} else if field.Required {
			warnings = append(warnings, fmt.Sprintf("Required field %s is not mapped", field.Name))
		}
	}

	return warnings
}