package automation

import (
	"testing"
	"time"
)

func TestFormDetectorConfig(t *testing.T) {
	config := DefaultFormDetectorConfig()

	if config.WaitTimeout != 10*time.Second {
		t.Errorf("Expected WaitTimeout to be 10s, got %v", config.WaitTimeout)
	}

	if config.AnalysisTimeout != 30*time.Second {
		t.Errorf("Expected AnalysisTimeout to be 30s, got %v", config.AnalysisTimeout)
	}

	if config.MaxForms != 10 {
		t.Errorf("Expected MaxForms to be 10, got %d", config.MaxForms)
	}

	if config.MinConfidence != 0.5 {
		t.Errorf("Expected MinConfidence to be 0.5, got %f", config.MinConfidence)
	}
}

func TestNewFormDetector(t *testing.T) {
	// Create a mock browser manager (this would need to be implemented)
	var browserManager *BrowserManager // This would be a real instance in actual tests

	detector := NewFormDetector(browserManager, nil)

	if detector == nil {
		t.Error("Expected FormDetector to be created")
	}

	if detector.config == nil {
		t.Error("Expected config to be set")
	}

	// Test with custom config
	customConfig := &FormDetectorConfig{
		WaitTimeout:     5 * time.Second,
		AnalysisTimeout: 15 * time.Second,
		MaxForms:        5,
		MinConfidence:   0.7,
	}

	detector2 := NewFormDetector(browserManager, customConfig)

	if detector2.config.WaitTimeout != 5*time.Second {
		t.Errorf("Expected custom WaitTimeout to be 5s, got %v", detector2.config.WaitTimeout)
	}
}

func TestFormTypeConstants(t *testing.T) {
	testCases := []struct {
		formType FormType
		expected string
	}{
		{FormTypeRegistration, "registration"},
		{FormTypeLogin, "login"},
		{FormTypeContact, "contact"},
		{FormTypeCheckout, "checkout"},
		{FormTypeProfile, "profile"},
		{FormTypeSurvey, "survey"},
		{FormTypeUnknown, "unknown"},
	}

	for _, tc := range testCases {
		if string(tc.formType) != tc.expected {
			t.Errorf("Expected FormType %v to equal %s, got %s", tc.formType, tc.expected, string(tc.formType))
		}
	}
}

func TestDetectedFormStructure(t *testing.T) {
	form := DetectedForm{
		Index:      0,
		Fields:     []DetectedField{},
		FormType:   FormTypeRegistration,
		Confidence: 85.5,
		Selector:   "form#registration",
		Action:     "/register",
		Method:     "POST",
	}

	if form.Index != 0 {
		t.Errorf("Expected Index to be 0, got %d", form.Index)
	}

	if form.FormType != FormTypeRegistration {
		t.Errorf("Expected FormType to be registration, got %s", form.FormType)
	}

	if form.Confidence != 85.5 {
		t.Errorf("Expected Confidence to be 85.5, got %f", form.Confidence)
	}
}

func TestDetectedFieldStructure(t *testing.T) {
	field := DetectedField{
		Name:              "email",
		Type:              "email",
		Label:             "Email Address",
		Selector:          "#email-field",
		Required:          true,
		Placeholder:       "Enter your email",
		ValidationPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
		Value:             "",
	}

	if field.Name != "email" {
		t.Errorf("Expected Name to be 'email', got %s", field.Name)
	}

	if field.Type != "email" {
		t.Errorf("Expected Type to be 'email', got %s", field.Type)
	}

	if !field.Required {
		t.Error("Expected Required to be true")
	}
}

func TestFormAnalysisResultStructure(t *testing.T) {
	result := FormAnalysisResult{
		Forms:        []DetectedForm{},
		TotalFields:  5,
		Confidence:   78.5,
		AnalysisTime: 150 * time.Millisecond,
		URL:          "https://example.com/register",
		Timestamp:    time.Now(),
	}

	if result.TotalFields != 5 {
		t.Errorf("Expected TotalFields to be 5, got %d", result.TotalFields)
	}

	if result.Confidence != 78.5 {
		t.Errorf("Expected Confidence to be 78.5, got %f", result.Confidence)
	}

	if result.URL != "https://example.com/register" {
		t.Errorf("Expected URL to be 'https://example.com/register', got %s", result.URL)
	}
}

func TestCalculateOverallConfidence(t *testing.T) {
	detector := &FormDetector{}

	// Test with empty forms
	emptyForms := []DetectedForm{}
	confidence := detector.calculateOverallConfidence(emptyForms)
	if confidence != 0 {
		t.Errorf("Expected confidence to be 0 for empty forms, got %f", confidence)
	}

	// Test with single form
	singleForm := []DetectedForm{
		{Confidence: 80.0},
	}
	confidence = detector.calculateOverallConfidence(singleForm)
	if confidence != 80.0 {
		t.Errorf("Expected confidence to be 80.0 for single form, got %f", confidence)
	}

	// Test with multiple forms
	multipleForms := []DetectedForm{
		{Confidence: 80.0},
		{Confidence: 60.0},
		{Confidence: 90.0},
	}
	confidence = detector.calculateOverallConfidence(multipleForms)
	expected := (80.0 + 60.0 + 90.0) / 3.0
	if confidence != expected {
		t.Errorf("Expected confidence to be %f for multiple forms, got %f", expected, confidence)
	}
}

func TestParseDetectedForm(t *testing.T) {
	detector := &FormDetector{}

	rawForm := map[string]interface{}{
		"fields": []interface{}{
			map[string]interface{}{
				"name":     "email",
				"type":     "email",
				"label":    "Email Address",
				"selector": "#email",
				"required": true,
			},
		},
		"submitButtons": []interface{}{
			map[string]interface{}{
				"text":     "Submit",
				"selector": "button[type='submit']",
				"type":     "submit",
			},
		},
		"formType":   "registration",
		"confidence": 85.5,
		"selector":   "form#register",
		"action":     "/register",
		"method":     "POST",
	}

	form, err := detector.parseDetectedForm(0, rawForm)
	if err != nil {
		t.Errorf("Unexpected error parsing form: %v", err)
	}

	if form.Index != 0 {
		t.Errorf("Expected Index to be 0, got %d", form.Index)
	}

	if len(form.Fields) != 1 {
		t.Errorf("Expected 1 field, got %d", len(form.Fields))
	}

	if form.Fields[0].Name != "email" {
		t.Errorf("Expected field name to be 'email', got %s", form.Fields[0].Name)
	}

	if len(form.SubmitButtons) != 1 {
		t.Errorf("Expected 1 submit button, got %d", len(form.SubmitButtons))
	}

	if form.FormType != FormTypeRegistration {
		t.Errorf("Expected FormType to be registration, got %s", form.FormType)
	}

	if form.Confidence != 85.5 {
		t.Errorf("Expected Confidence to be 85.5, got %f", form.Confidence)
	}
}

func TestGenerateFormTemplate(t *testing.T) {
	detector := &FormDetector{}

	detectedForm := DetectedForm{
		Index: 0,
		Fields: []DetectedField{
			{
				Name:     "email",
				Type:     "email",
				Label:    "Email Address",
				Selector: "#email",
				Required: true,
			},
			{
				Name:     "password",
				Type:     "password",
				Label:    "Password",
				Selector: "#password",
				Required: true,
			},
		},
		FormType:   FormTypeLogin,
		Confidence: 90.0,
		Selector:   "form#login",
		Action:     "/login",
		Method:     "POST",
	}

	template, err := detector.GenerateFormTemplate(detectedForm, "https://example.com/login")
	if err != nil {
		t.Errorf("Unexpected error generating template: %v", err)
	}

	if template.URL != "https://example.com/login" {
		t.Errorf("Expected URL to be 'https://example.com/login', got %s", template.URL)
	}

	if template.Domain != "example.com" {
		t.Errorf("Expected Domain to be 'example.com', got %s", template.Domain)
	}

	if len(template.Fields) != 2 {
		t.Errorf("Expected 2 fields, got %d", len(template.Fields))
	}

	if template.Fields[0].Name != "email" {
		t.Errorf("Expected first field name to be 'email', got %s", template.Fields[0].Name)
	}

	if template.Selectors["email"] != "#email" {
		t.Errorf("Expected email selector to be '#email', got %s", template.Selectors["email"])
	}

	if template.Version != 1 {
		t.Errorf("Expected Version to be 1, got %d", template.Version)
	}

	if template.SuccessRate != 0.0 {
		t.Errorf("Expected SuccessRate to be 0.0, got %f", template.SuccessRate)
	}
}

func TestGenerateFormTemplateInvalidURL(t *testing.T) {
	detector := &FormDetector{}

	detectedForm := DetectedForm{
		FormType: FormTypeUnknown,
	}

	_, err := detector.GenerateFormTemplate(detectedForm, "://invalid-url")
	if err == nil {
		t.Error("Expected error for invalid URL")
	}
}

// Mock tests that would require actual browser integration
func TestFormDetectorIntegration(t *testing.T) {
	// These tests would require a real browser manager and Playwright setup
	// For now, we'll skip them in unit tests
	t.Skip("Integration tests require browser setup")

	// Example of what integration tests would look like:
	/*
	browserManager := NewBrowserManager(DefaultBrowserConfig())
	detector := NewFormDetector(browserManager, nil)

	ctx := context.Background()
	result, err := detector.AnalyzePage(ctx, "https://example.com/register")

	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	if result == nil {
		t.Error("Expected analysis result")
	}
	*/
}

// Benchmark tests
func BenchmarkCalculateOverallConfidence(b *testing.B) {
	detector := &FormDetector{}
	forms := make([]DetectedForm, 100)
	for i := range forms {
		forms[i] = DetectedForm{Confidence: float64(i)}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		detector.calculateOverallConfidence(forms)
	}
}

func BenchmarkParseDetectedForm(b *testing.B) {
	detector := &FormDetector{}
	rawForm := map[string]interface{}{
		"fields": []interface{}{
			map[string]interface{}{
				"name":     "email",
				"type":     "email",
				"label":    "Email",
				"selector": "#email",
				"required": true,
			},
		},
		"formType":   "login",
		"confidence": 85.0,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		detector.parseDetectedForm(0, rawForm)
	}
}