package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

// FormDetector handles form detection and analysis on web pages
type FormDetector struct {
	browserManager *BrowserManager
	config         *FormDetectorConfig
}

// FormDetectorConfig holds configuration for form detection
type FormDetectorConfig struct {
	WaitTimeout     time.Duration
	AnalysisTimeout time.Duration
	MaxForms        int
	MinConfidence   float64
}

// DefaultFormDetectorConfig returns sensible defaults
func DefaultFormDetectorConfig() *FormDetectorConfig {
	return &FormDetectorConfig{
		WaitTimeout:     10 * time.Second,
		AnalysisTimeout: 30 * time.Second,
		MaxForms:        10,
		MinConfidence:   0.5,
	}
}

// FormAnalysisResult represents the result of form analysis
type FormAnalysisResult struct {
	Forms        []DetectedForm `json:"forms"`
	TotalFields  int            `json:"totalFields"`
	Confidence   float64        `json:"confidence"`
	AnalysisTime time.Duration  `json:"analysisTime"`
	URL          string         `json:"url"`
	Timestamp    time.Time      `json:"timestamp"`
}

// DetectedForm represents a detected form on a web page
type DetectedForm struct {
	Index         int             `json:"index"`
	Fields        []DetectedField `json:"fields"`
	SubmitButtons []SubmitButton  `json:"submitButtons"`
	FormType      FormType        `json:"formType"`
	Confidence    float64         `json:"confidence"`
	Selector      string          `json:"selector"`
	Action        string          `json:"action"`
	Method        string          `json:"method"`
}

// DetectedField represents a detected form field
type DetectedField struct {
	Name              string `json:"name"`
	Type              string `json:"type"`
	Label             string `json:"label"`
	Selector          string `json:"selector"`
	Required          bool   `json:"required"`
	Placeholder       string `json:"placeholder,omitempty"`
	ValidationPattern string `json:"validationPattern,omitempty"`
	Value             string `json:"value,omitempty"`
}

// SubmitButton represents a form submit button
type SubmitButton struct {
	Text     string `json:"text"`
	Selector string `json:"selector"`
	Type     string `json:"type"`
}

// FormType represents different types of forms
type FormType string

const (
	FormTypeRegistration FormType = "registration"
	FormTypeLogin        FormType = "login"
	FormTypeContact      FormType = "contact"
	FormTypeCheckout     FormType = "checkout"
	FormTypeProfile      FormType = "profile"
	FormTypeSurvey       FormType = "survey"
	FormTypeUnknown      FormType = "unknown"
)

// NewFormDetector creates a new form detector instance
func NewFormDetector(browserManager *BrowserManager, config *FormDetectorConfig) *FormDetector {
	if config == nil {
		config = DefaultFormDetectorConfig()
	}

	return &FormDetector{
		browserManager: browserManager,
		config:         config,
	}
}

// AnalyzePage analyzes a web page for forms and returns detailed analysis
func (fd *FormDetector) AnalyzePage(ctx context.Context, pageURL string) (*FormAnalysisResult, error) {
	startTime := time.Now()

	// Create a new page
	page, err := fd.browserManager.CreatePage(DefaultBrowserConfig())
	if err != nil {
		return nil, fmt.Errorf("failed to create page: %w", err)
	}
	defer (*page).Close()

	// Navigate to the page
	_, err = (*page).Goto(pageURL, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
		Timeout:   playwright.Float(float64(fd.config.WaitTimeout.Milliseconds())),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to navigate to %s: %w", pageURL, err)
	}

	// Wait for page to stabilize
	time.Sleep(2 * time.Second)

	// Inject form detection script and analyze
	forms, err := fd.detectForms(ctx, page)
	if err != nil {
		return nil, fmt.Errorf("failed to detect forms: %w", err)
	}

	// Calculate metrics
	totalFields := 0
	for _, form := range forms {
		totalFields += len(form.Fields)
	}

	confidence := fd.calculateOverallConfidence(forms)
	analysisTime := time.Since(startTime)

	return &FormAnalysisResult{
		Forms:        forms,
		TotalFields:  totalFields,
		Confidence:   confidence,
		AnalysisTime: analysisTime,
		URL:          pageURL,
		Timestamp:    time.Now(),
	}, nil
}

// detectForms detects all forms on the current page
func (fd *FormDetector) detectForms(ctx context.Context, page *playwright.Page) ([]DetectedForm, error) {
	// Inject form detection JavaScript
	script := fd.getFormDetectionScript()
	
	result, err := (*page).Evaluate(script)
	if err != nil {
		return nil, fmt.Errorf("failed to execute form detection script: %w", err)
	}

	// Parse the result
	var rawForms []map[string]interface{}
	if err := json.Unmarshal([]byte(fmt.Sprintf("%v", result)), &rawForms); err != nil {
		return nil, fmt.Errorf("failed to parse form detection result: %w", err)
	}

	// Convert to DetectedForm structs
	forms := make([]DetectedForm, 0, len(rawForms))
	for i, rawForm := range rawForms {
		form, err := fd.parseDetectedForm(i, rawForm)
		if err != nil {
			continue // Skip invalid forms
		}
		forms = append(forms, *form)
	}

	// Filter by confidence threshold
	filteredForms := make([]DetectedForm, 0, len(forms))
	for _, form := range forms {
		if form.Confidence >= fd.config.MinConfidence {
			filteredForms = append(filteredForms, form)
		}
	}

	// Limit number of forms
	if len(filteredForms) > fd.config.MaxForms {
		filteredForms = filteredForms[:fd.config.MaxForms]
	}

	return filteredForms, nil
}

// parseDetectedForm converts raw form data to DetectedForm struct
func (fd *FormDetector) parseDetectedForm(index int, rawForm map[string]interface{}) (*DetectedForm, error) {
	form := &DetectedForm{
		Index: index,
	}

	// Parse fields
	if fieldsData, ok := rawForm["fields"].([]interface{}); ok {
		for _, fieldData := range fieldsData {
			if fieldMap, ok := fieldData.(map[string]interface{}); ok {
				field := DetectedField{}
				
				if name, ok := fieldMap["name"].(string); ok {
					field.Name = name
				}
				if fieldType, ok := fieldMap["type"].(string); ok {
					field.Type = fieldType
				}
				if label, ok := fieldMap["label"].(string); ok {
					field.Label = label
				}
				if selector, ok := fieldMap["selector"].(string); ok {
					field.Selector = selector
				}
				if required, ok := fieldMap["required"].(bool); ok {
					field.Required = required
				}
				if placeholder, ok := fieldMap["placeholder"].(string); ok {
					field.Placeholder = placeholder
				}
				if pattern, ok := fieldMap["validationPattern"].(string); ok {
					field.ValidationPattern = pattern
				}

				form.Fields = append(form.Fields, field)
			}
		}
	}

	// Parse submit buttons
	if buttonsData, ok := rawForm["submitButtons"].([]interface{}); ok {
		for _, buttonData := range buttonsData {
			if buttonMap, ok := buttonData.(map[string]interface{}); ok {
				button := SubmitButton{}
				
				if text, ok := buttonMap["text"].(string); ok {
					button.Text = text
				}
				if selector, ok := buttonMap["selector"].(string); ok {
					button.Selector = selector
				}
				if buttonType, ok := buttonMap["type"].(string); ok {
					button.Type = buttonType
				}

				form.SubmitButtons = append(form.SubmitButtons, button)
			}
		}
	}

	// Parse other properties
	if formType, ok := rawForm["formType"].(string); ok {
		form.FormType = FormType(formType)
	}
	if confidence, ok := rawForm["confidence"].(float64); ok {
		form.Confidence = confidence
	}
	if selector, ok := rawForm["selector"].(string); ok {
		form.Selector = selector
	}
	if action, ok := rawForm["action"].(string); ok {
		form.Action = action
	}
	if method, ok := rawForm["method"].(string); ok {
		form.Method = method
	}

	return form, nil
}

// getFormDetectionScript returns JavaScript code for form detection
func (fd *FormDetector) getFormDetectionScript() string {
	return `
		(function() {
			const forms = [];
			const formElements = document.querySelectorAll('form');
			
			formElements.forEach((formElement, index) => {
				const fields = [];
				const submitButtons = [];
				
				// Analyze form fields
				const fieldSelectors = [
					'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
					'select',
					'textarea'
				];
				
				fieldSelectors.forEach(selector => {
					const elements = formElement.querySelectorAll(selector);
					elements.forEach(element => {
						const field = analyzeField(element);
						if (field) {
							fields.push(field);
						}
					});
				});
				
				// Find submit buttons
				const submitSelectors = [
					'input[type="submit"]',
					'button[type="submit"]',
					'button:not([type])'
				];
				
				submitSelectors.forEach(selector => {
					const elements = formElement.querySelectorAll(selector);
					elements.forEach(element => {
						submitButtons.push({
							text: element.textContent || element.value || '',
							selector: generateSelector(element),
							type: element.type || 'button'
						});
					});
				});
				
				// Classify form type
				const formType = classifyFormType(formElement, fields);
				
				// Calculate confidence
				const confidence = calculateFormConfidence(formElement, fields);
				
				forms.push({
					fields: fields,
					submitButtons: submitButtons,
					formType: formType,
					confidence: confidence,
					selector: generateSelector(formElement),
					action: formElement.action || '',
					method: formElement.method || 'GET'
				});
			});
			
			function analyzeField(element) {
				const name = element.name || element.id || '';
				const type = element.type || element.tagName.toLowerCase();
				const label = extractFieldLabel(element);
				const selector = generateSelector(element);
				const required = element.required || element.hasAttribute('required');
				const placeholder = element.placeholder || '';
				const validationPattern = element.pattern || '';
				
				if (!name && !label) {
					return null;
				}
				
				return {
					name: name,
					type: type,
					label: label,
					selector: selector,
					required: required,
					placeholder: placeholder,
					validationPattern: validationPattern
				};
			}
			
			function extractFieldLabel(element) {
				// Check for associated label
				if (element.id) {
					const label = document.querySelector('label[for="' + element.id + '"]');
					if (label) {
						return label.textContent.trim();
					}
				}
				
				// Check for parent label
				const parentLabel = element.closest('label');
				if (parentLabel) {
					return parentLabel.textContent.replace(element.textContent || '', '').trim();
				}
				
				// Check placeholder
				if (element.placeholder) {
					return element.placeholder;
				}
				
				// Check nearby text
				const parent = element.parentElement;
				if (parent) {
					const text = parent.textContent.replace(element.textContent || '', '').trim();
					if (text && text.length < 100) {
						return text;
					}
				}
				
				return '';
			}
			
			function generateSelector(element) {
				// Try ID first
				if (element.id) {
					return '#' + element.id;
				}
				
				// Try name
				if (element.name) {
					return '[name="' + element.name + '"]';
				}
				
				// Generate path-based selector
				const path = [];
				let current = element;
				
				while (current && current !== document.body) {
					let selector = current.tagName.toLowerCase();
					
					// Add classes if available
					const classes = Array.from(current.classList).filter(cls => 
						!cls.includes('ng-') && !cls.includes('v-') && cls.length < 20
					);
					if (classes.length > 0) {
						selector += '.' + classes.join('.');
					}
					
					path.unshift(selector);
					current = current.parentElement;
				}
				
				return path.join(' > ');
			}
			
			function classifyFormType(formElement, fields) {
				const fieldNames = fields.map(f => f.name.toLowerCase());
				const formText = formElement.textContent.toLowerCase();
				
				// Registration patterns
				if (formText.includes('register') || formText.includes('sign up') || 
					fieldNames.some(name => name.includes('password') && name.includes('confirm'))) {
					return 'registration';
				}
				
				// Login patterns
				if (formText.includes('login') || formText.includes('sign in') ||
					(fieldNames.includes('password') && fieldNames.some(name => name.includes('email') || name.includes('username')))) {
					return 'login';
				}
				
				// Contact patterns
				if (formText.includes('contact') || formText.includes('message') ||
					fieldNames.some(name => name.includes('message') || name.includes('subject'))) {
					return 'contact';
				}
				
				// Checkout patterns
				if (formText.includes('checkout') || formText.includes('payment') ||
					fieldNames.some(name => name.includes('card') || name.includes('billing'))) {
					return 'checkout';
				}
				
				return 'unknown';
			}
			
			function calculateFormConfidence(formElement, fields) {
				let confidence = 0;
				
				// Base confidence for having fields
				confidence += Math.min(fields.length * 10, 50);
				
				// Bonus for having labels
				const fieldsWithLabels = fields.filter(f => f.label.length > 0);
				confidence += (fieldsWithLabels.length / fields.length) * 20;
				
				// Bonus for having names
				const fieldsWithNames = fields.filter(f => f.name.length > 0);
				confidence += (fieldsWithNames.length / fields.length) * 15;
				
				// Bonus for submit buttons
				const submitButtons = formElement.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
				if (submitButtons.length > 0) {
					confidence += 15;
				}
				
				return Math.min(confidence, 100);
			}
			
			return forms;
		})();
	`
}

// calculateOverallConfidence calculates the overall confidence across all forms
func (fd *FormDetector) calculateOverallConfidence(forms []DetectedForm) float64 {
	if len(forms) == 0 {
		return 0
	}

	totalConfidence := 0.0
	for _, form := range forms {
		totalConfidence += form.Confidence
	}

	return totalConfidence / float64(len(forms))
}

// GenerateFormTemplate generates a FormTemplate from a DetectedForm
func (fd *FormDetector) GenerateFormTemplate(detectedForm DetectedForm, pageURL string) (*FormTemplate, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// Convert DetectedFields to FormFields
	fields := make([]FormField, len(detectedForm.Fields))
	selectors := make(map[string]string)

	for i, detectedField := range detectedForm.Fields {
		fieldID := fmt.Sprintf("field_%s_%d", detectedField.Name, time.Now().UnixNano())
		
		fields[i] = FormField{
			ID:                fieldID,
			Name:              detectedField.Name,
			Type:              detectedField.Type,
			Selector:          detectedField.Selector,
			Label:             detectedField.Label,
			Required:          detectedField.Required,
			ValidationPattern: detectedField.ValidationPattern,
			DefaultValue:      detectedField.Placeholder,
		}

		selectors[detectedField.Name] = detectedField.Selector
	}

	// Generate template ID
	templateID := fmt.Sprintf("template_%s_%s_%d", 
		strings.ReplaceAll(parsedURL.Hostname(), ".", "_"),
		detectedForm.FormType,
		time.Now().UnixNano())

	template := &FormTemplate{
		ID:              templateID,
		URL:             pageURL,
		Domain:          parsedURL.Hostname(),
		FormType:        string(detectedForm.FormType),
		Fields:          fields,
		Selectors:       selectors,
		ValidationRules: []ValidationRule{},
		SuccessRate:     0.0,
		LastUpdated:     time.Now(),
		Version:         1,
	}

	return template, nil
}

// ValidateSelector validates if a selector works on the current page
func (fd *FormDetector) ValidateSelector(ctx context.Context, page *playwright.Page, selector string) (bool, error) {
	script := fmt.Sprintf(`
		(function() {
			try {
				const elements = document.querySelectorAll('%s');
				return elements.length === 1;
			} catch (e) {
				return false;
			}
		})();
	`, selector)

	result, err := (*page).Evaluate(script)
	if err != nil {
		return false, err
	}

	if valid, ok := result.(bool); ok {
		return valid, nil
	}

	return false, nil
}

// GenerateAlternativeSelectors generates alternative selectors for an element
func (fd *FormDetector) GenerateAlternativeSelectors(ctx context.Context, page *playwright.Page, originalSelector string) ([]string, error) {
	script := fmt.Sprintf(`
		(function() {
			const element = document.querySelector('%s');
			if (!element) return [];
			
			const selectors = [];
			
			// ID selector
			if (element.id) {
				selectors.push('#' + element.id);
			}
			
			// Name selector
			if (element.name) {
				selectors.push('[name="' + element.name + '"]');
			}
			
			// Data attribute selectors
			const dataAttrs = ['data-name', 'data-field', 'data-testid'];
			dataAttrs.forEach(attr => {
				const value = element.getAttribute(attr);
				if (value) {
					selectors.push('[' + attr + '="' + value + '"]');
				}
			});
			
			// Class selector
			if (element.className) {
				const classes = element.className.split(' ').filter(cls => 
					cls && !cls.includes('ng-') && !cls.includes('v-')
				);
				if (classes.length > 0) {
					selectors.push('.' + classes.join('.'));
				}
			}
			
			return selectors;
		})();
	`, originalSelector)

	result, err := (*page).Evaluate(script)
	if err != nil {
		return nil, err
	}

	if selectorsInterface, ok := result.([]interface{}); ok {
		selectors := make([]string, len(selectorsInterface))
		for i, s := range selectorsInterface {
			if selector, ok := s.(string); ok {
				selectors[i] = selector
			}
		}
		return selectors, nil
	}

	return []string{}, nil
}

// OptimizeTemplate optimizes a form template by validating and improving selectors
func (fd *FormDetector) OptimizeTemplate(ctx context.Context, template *FormTemplate) (*FormTemplate, error) {
	// Create a new page to test the template
	page, err := fd.browserManager.CreatePage(DefaultBrowserConfig())
	if err != nil {
		return nil, fmt.Errorf("failed to create page: %w", err)
	}
	defer (*page).Close()

	// Navigate to the template URL
	_, err = (*page).Goto(template.URL, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
		Timeout:   playwright.Float(float64(fd.config.WaitTimeout.Milliseconds())),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to navigate to template URL: %w", err)
	}

	optimizedTemplate := *template
	optimizedFields := make([]FormField, len(template.Fields))

	// Validate and optimize each field selector
	for i, field := range template.Fields {
		optimizedFields[i] = field

		// Validate current selector
		valid, err := fd.ValidateSelector(ctx, page, field.Selector)
		if err != nil || !valid {
			// Try to find alternative selectors
			alternatives, err := fd.GenerateAlternativeSelectors(ctx, page, field.Selector)
			if err == nil && len(alternatives) > 0 {
				// Test each alternative and use the first valid one
				for _, altSelector := range alternatives {
					if valid, _ := fd.ValidateSelector(ctx, page, altSelector); valid {
						optimizedFields[i].Selector = altSelector
						optimizedTemplate.Selectors[field.Name] = altSelector
						break
					}
				}
			}
		}
	}

	optimizedTemplate.Fields = optimizedFields
	optimizedTemplate.LastUpdated = time.Now()
	optimizedTemplate.Version++

	return &optimizedTemplate, nil
}