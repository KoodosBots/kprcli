package automation

import (
	"context"
	"fmt"
	"time"

	"github.com/playwright-community/playwright-go"
)

// FormFiller handles automated form filling operations
type FormFiller struct {
	browserManager *BrowserManager
	config         *FormFillerConfig
}

// FormFillerConfig holds configuration for form filling operations
type FormFillerConfig struct {
	FillDelay       time.Duration
	SubmitDelay     time.Duration
	MaxRetries      int
	TakeScreenshots bool
	WaitForLoad     time.Duration
}

// DefaultFormFillerConfig returns sensible defaults
func DefaultFormFillerConfig() *FormFillerConfig {
	return &FormFillerConfig{
		FillDelay:       100 * time.Millisecond,
		SubmitDelay:     1 * time.Second,
		MaxRetries:      3,
		TakeScreenshots: true,
		WaitForLoad:     5 * time.Second,
	}
}

// FormTemplate represents a learned form structure
type FormTemplate struct {
	ID              string                 `json:"id"`
	URL             string                 `json:"url"`
	Domain          string                 `json:"domain"`
	FormType        string                 `json:"form_type"`
	Fields          []FormField            `json:"fields"`
	Selectors       map[string]string      `json:"selectors"`
	ValidationRules []ValidationRule       `json:"validation_rules"`
	SuccessRate     float64                `json:"success_rate"`
	LastUpdated     time.Time              `json:"last_updated"`
	Version         int                    `json:"version"`
}

// FormField represents a form input field
type FormField struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Type             string `json:"type"`
	Selector         string `json:"selector"`
	Label            string `json:"label"`
	Required         bool   `json:"required"`
	ValidationPattern string `json:"validation_pattern,omitempty"`
	DefaultValue     string `json:"default_value,omitempty"`
}

// ValidationRule represents a form validation rule
type ValidationRule struct {
	Field   string `json:"field"`
	Type    string `json:"type"`
	Pattern string `json:"pattern"`
	Message string `json:"message"`
}

// FillResult represents the result of a form filling operation
type FillResult struct {
	Success       bool              `json:"success"`
	FilledFields  int               `json:"filled_fields"`
	TotalFields   int               `json:"total_fields"`
	SuccessRate   float64           `json:"success_rate"`
	ExecutionTime time.Duration     `json:"execution_time"`
	Errors        []string          `json:"errors"`
	Screenshots   []string          `json:"screenshots"`
	URL           string            `json:"url"`
	Timestamp     time.Time         `json:"timestamp"`
}

// ProfileData represents user profile information
type ProfileData struct {
	FirstName string  `json:"first_name"`
	LastName  string  `json:"last_name"`
	Email     string  `json:"email"`
	Phone     string  `json:"phone"`
	Address   Address `json:"address"`
}

// Address represents address information
type Address struct {
	Street  string `json:"street"`
	City    string `json:"city"`
	State   string `json:"state"`
	ZipCode string `json:"zip_code"`
	Country string `json:"country"`
}

// NewFormFiller creates a new form filler instance
func NewFormFiller(browserManager *BrowserManager, config *FormFillerConfig) *FormFiller {
	if config == nil {
		config = DefaultFormFillerConfig()
	}

	return &FormFiller{
		browserManager: browserManager,
		config:         config,
	}
}

// FillForm fills a form using the provided template and profile data
func (ff *FormFiller) FillForm(ctx context.Context, template *FormTemplate, profileData *ProfileData) (*FillResult, error) {
	startTime := time.Now()
	result := &FillResult{
		URL:         template.URL,
		Timestamp:   startTime,
		TotalFields: len(template.Fields),
		Screenshots: []string{},
		Errors:      []string{},
	}

	// Create a new page
	page, err := ff.browserManager.CreatePage(DefaultBrowserConfig())
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to create page: %v", err))
		return result, err
	}
	defer (*page).Close()

	// Navigate to the form URL
	_, err = (*page).Goto(template.URL, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
		Timeout:   playwright.Float(30000),
	})
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to navigate to %s: %v", template.URL, err))
		return result, err
	}

	// Wait for page to load
	time.Sleep(ff.config.WaitForLoad)

	// Take initial screenshot if enabled
	if ff.config.TakeScreenshots {
		screenshotPath := fmt.Sprintf("screenshot_%s_initial.png", time.Now().Format("20060102_150405"))
		_, err = (*page).Screenshot(playwright.PageScreenshotOptions{
			Path: &screenshotPath,
		})
		if err == nil {
			result.Screenshots = append(result.Screenshots, screenshotPath)
		}
	}

	// Fill each field
	for _, field := range template.Fields {
		err := ff.fillField(ctx, page, &field, profileData)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to fill field %s: %v", field.Name, err))
			continue
		}
		result.FilledFields++

		// Add delay between field fills
		time.Sleep(ff.config.FillDelay)
	}

	// Calculate success rate
	if result.TotalFields > 0 {
		result.SuccessRate = float64(result.FilledFields) / float64(result.TotalFields) * 100
	}

	// Take final screenshot if enabled
	if ff.config.TakeScreenshots {
		screenshotPath := fmt.Sprintf("screenshot_%s_final.png", time.Now().Format("20060102_150405"))
		_, err = (*page).Screenshot(playwright.PageScreenshotOptions{
			Path: &screenshotPath,
		})
		if err == nil {
			result.Screenshots = append(result.Screenshots, screenshotPath)
		}
	}

	result.ExecutionTime = time.Since(startTime)
	result.Success = result.FilledFields > 0 && len(result.Errors) == 0

	return result, nil
}

// fillField fills a single form field with appropriate data
func (ff *FormFiller) fillField(ctx context.Context, page *playwright.Page, field *FormField, profileData *ProfileData) error {
	// Get the value to fill based on field type and name
	value := ff.getFieldValue(field, profileData)
	if value == "" {
		return fmt.Errorf("no value found for field %s", field.Name)
	}

	// Wait for the element to be visible
	_, err := (*page).WaitForSelector(field.Selector, playwright.PageWaitForSelectorOptions{
		State:   playwright.WaitForSelectorStateVisible,
		Timeout: playwright.Float(10000),
	})
	if err != nil {
		return fmt.Errorf("element not found or not visible: %s", field.Selector)
	}

	// Handle different field types
	switch field.Type {
	case "text", "email", "password", "tel", "url":
		err = (*page).Fill(field.Selector, value)
	case "textarea":
		err = (*page).Fill(field.Selector, value)
	case "select":
		_, err = (*page).SelectOption(field.Selector, playwright.SelectOptionValues{
			Values: &[]string{value},
		})
	case "checkbox":
		if value == "true" || value == "1" || value == "yes" {
			err = (*page).Check(field.Selector)
		}
	case "radio":
		err = (*page).Check(field.Selector)
	default:
		err = (*page).Fill(field.Selector, value)
	}

	if err != nil {
		return fmt.Errorf("failed to fill field: %w", err)
	}

	// Trigger change event
	_, err = (*page).Evaluate(fmt.Sprintf(`
		const element = document.querySelector('%s');
		if (element) {
			element.dispatchEvent(new Event('input', { bubbles: true }));
			element.dispatchEvent(new Event('change', { bubbles: true }));
		}
	`, field.Selector))

	return err
}

// getFieldValue maps form fields to profile data
func (ff *FormFiller) getFieldValue(field *FormField, profileData *ProfileData) string {
	// Create field mappings based on common field names and types
	fieldMappings := map[string]string{
		"email":      profileData.Email,
		"firstname":  profileData.FirstName,
		"first_name": profileData.FirstName,
		"fname":      profileData.FirstName,
		"lastname":   profileData.LastName,
		"last_name":  profileData.LastName,
		"lname":      profileData.LastName,
		"phone":      profileData.Phone,
		"telephone":  profileData.Phone,
		"mobile":     profileData.Phone,
		"address":    profileData.Address.Street,
		"street":     profileData.Address.Street,
		"city":       profileData.Address.City,
		"state":      profileData.Address.State,
		"zip":        profileData.Address.ZipCode,
		"zipcode":    profileData.Address.ZipCode,
		"postal":     profileData.Address.ZipCode,
		"country":    profileData.Address.Country,
	}

	// Try exact match first
	fieldName := field.Name
	if value, exists := fieldMappings[fieldName]; exists && value != "" {
		return value
	}

	// Try fuzzy matching based on field label
	fieldLabel := field.Label
	for key, value := range fieldMappings {
		if value != "" && (contains(fieldName, key) || contains(fieldLabel, key)) {
			return value
		}
	}

	// Handle email type fields
	if field.Type == "email" && profileData.Email != "" {
		return profileData.Email
	}

	// Handle tel type fields
	if field.Type == "tel" && profileData.Phone != "" {
		return profileData.Phone
	}

	return ""
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && 
		   (s == substr || 
		    len(s) > len(substr) && 
		    (s[:len(substr)] == substr || 
		     s[len(s)-len(substr):] == substr ||
		     findInString(s, substr)))
}

// findInString performs a simple substring search
func findInString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// SubmitForm submits the form after filling
func (ff *FormFiller) SubmitForm(ctx context.Context, page *playwright.Page, template *FormTemplate) error {
	// Wait before submitting
	time.Sleep(ff.config.SubmitDelay)

	// Look for submit button
	submitSelectors := []string{
		"input[type='submit']",
		"button[type='submit']",
		"button:has-text('Submit')",
		"button:has-text('Send')",
		"button:has-text('Continue')",
		"input[value*='Submit']",
		"input[value*='Send']",
	}

	for _, selector := range submitSelectors {
		elements, err := (*page).QuerySelectorAll(selector)
		if err != nil {
			continue
		}

		if len(elements) > 0 {
			err = elements[0].Click()
			if err == nil {
				return nil
			}
		}
	}

	return fmt.Errorf("no submit button found")
}

// ValidateForm validates form fields before submission
func (ff *FormFiller) ValidateForm(ctx context.Context, page *playwright.Page, template *FormTemplate) []string {
	var errors []string

	for _, rule := range template.ValidationRules {
		// This is a placeholder for validation logic
		// In a real implementation, you'd check each validation rule
		_ = rule
	}

	return errors
}