package automation

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// TemplateManager manages form templates storage and retrieval
type TemplateManager struct {
	templatesDir string
	templates    map[string]*FormTemplate
}

// TemplateSearchCriteria defines criteria for searching templates
type TemplateSearchCriteria struct {
	Domain      string    `json:"domain,omitempty"`
	URL         string    `json:"url,omitempty"`
	FormType    FormType  `json:"formType,omitempty"`
	MinSuccess  float64   `json:"minSuccess,omitempty"`
	MaxAge      time.Duration `json:"maxAge,omitempty"`
}

// TemplateMetrics contains metrics about template performance
type TemplateMetrics struct {
	TotalTemplates    int                    `json:"totalTemplates"`
	TemplatesByDomain map[string]int         `json:"templatesByDomain"`
	TemplatesByType   map[FormType]int       `json:"templatesByType"`
	AverageSuccess    float64                `json:"averageSuccess"`
	LastUpdated       time.Time              `json:"lastUpdated"`
}

// NewTemplateManager creates a new template manager
func NewTemplateManager(templatesDir string) (*TemplateManager, error) {
	// Create templates directory if it doesn't exist
	if err := os.MkdirAll(templatesDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create templates directory: %w", err)
	}

	tm := &TemplateManager{
		templatesDir: templatesDir,
		templates:    make(map[string]*FormTemplate),
	}

	// Load existing templates
	if err := tm.LoadTemplates(); err != nil {
		return nil, fmt.Errorf("failed to load templates: %w", err)
	}

	return tm, nil
}

// SaveTemplate saves a form template to disk
func (tm *TemplateManager) SaveTemplate(template *FormTemplate) error {
	if template.ID == "" {
		return fmt.Errorf("template ID cannot be empty")
	}

	// Update timestamp
	template.LastUpdated = time.Now()

	// Create filename based on domain and template ID
	filename := tm.getTemplateFilename(template)
	filepath := filepath.Join(tm.templatesDir, filename)

	// Marshal template to JSON
	data, err := json.MarshalIndent(template, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal template: %w", err)
	}

	// Write to file
	if err := ioutil.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("failed to write template file: %w", err)
	}

	// Update in-memory cache
	tm.templates[template.ID] = template

	return nil
}

// LoadTemplate loads a specific template by ID
func (tm *TemplateManager) LoadTemplate(templateID string) (*FormTemplate, error) {
	// Check in-memory cache first
	if template, exists := tm.templates[templateID]; exists {
		return template, nil
	}

	// Search for template file
	files, err := ioutil.ReadDir(tm.templatesDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read templates directory: %w", err)
	}

	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".json") {
			template, err := tm.loadTemplateFromFile(filepath.Join(tm.templatesDir, file.Name()))
			if err != nil {
				continue // Skip invalid files
			}

			if template.ID == templateID {
				tm.templates[templateID] = template
				return template, nil
			}
		}
	}

	return nil, fmt.Errorf("template not found: %s", templateID)
}

// LoadTemplates loads all templates from disk
func (tm *TemplateManager) LoadTemplates() error {
	files, err := ioutil.ReadDir(tm.templatesDir)
	if err != nil {
		return fmt.Errorf("failed to read templates directory: %w", err)
	}

	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".json") {
			template, err := tm.loadTemplateFromFile(filepath.Join(tm.templatesDir, file.Name()))
			if err != nil {
				continue // Skip invalid files
			}

			tm.templates[template.ID] = template
		}
	}

	return nil
}

// loadTemplateFromFile loads a template from a JSON file
func (tm *TemplateManager) loadTemplateFromFile(filepath string) (*FormTemplate, error) {
	data, err := ioutil.ReadFile(filepath)
	if err != nil {
		return nil, fmt.Errorf("failed to read template file: %w", err)
	}

	var template FormTemplate
	if err := json.Unmarshal(data, &template); err != nil {
		return nil, fmt.Errorf("failed to unmarshal template: %w", err)
	}

	return &template, nil
}

// FindTemplates finds templates matching the given criteria
func (tm *TemplateManager) FindTemplates(criteria TemplateSearchCriteria) ([]*FormTemplate, error) {
	var matches []*FormTemplate

	for _, template := range tm.templates {
		if tm.matchesCriteria(template, criteria) {
			matches = append(matches, template)
		}
	}

	// Sort by success rate (highest first)
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].SuccessRate > matches[j].SuccessRate
	})

	return matches, nil
}

// FindBestTemplate finds the best template for a given URL
func (tm *TemplateManager) FindBestTemplate(targetURL string) (*FormTemplate, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// First, try exact URL match
	criteria := TemplateSearchCriteria{
		URL: targetURL,
	}
	matches, err := tm.FindTemplates(criteria)
	if err == nil && len(matches) > 0 {
		return matches[0], nil
	}

	// Then, try domain match
	criteria = TemplateSearchCriteria{
		Domain: parsedURL.Hostname(),
	}
	matches, err = tm.FindTemplates(criteria)
	if err == nil && len(matches) > 0 {
		return matches[0], nil
	}

	return nil, fmt.Errorf("no suitable template found for URL: %s", targetURL)
}

// matchesCriteria checks if a template matches the search criteria
func (tm *TemplateManager) matchesCriteria(template *FormTemplate, criteria TemplateSearchCriteria) bool {
	// Check domain
	if criteria.Domain != "" && template.Domain != criteria.Domain {
		return false
	}

	// Check URL
	if criteria.URL != "" && template.URL != criteria.URL {
		return false
	}

	// Check form type
	if criteria.FormType != "" && FormType(template.FormType) != criteria.FormType {
		return false
	}

	// Check minimum success rate
	if criteria.MinSuccess > 0 && template.SuccessRate < criteria.MinSuccess {
		return false
	}

	// Check age
	if criteria.MaxAge > 0 {
		age := time.Since(template.LastUpdated)
		if age > criteria.MaxAge {
			return false
		}
	}

	return true
}

// UpdateTemplateSuccess updates the success rate of a template
func (tm *TemplateManager) UpdateTemplateSuccess(templateID string, successRate float64) error {
	template, exists := tm.templates[templateID]
	if !exists {
		return fmt.Errorf("template not found: %s", templateID)
	}

	// Update success rate using weighted average
	// Give more weight to recent results
	currentWeight := 0.7
	newWeight := 0.3
	
	template.SuccessRate = template.SuccessRate*currentWeight + successRate*newWeight
	template.LastUpdated = time.Now()

	// Save updated template
	return tm.SaveTemplate(template)
}

// DeleteTemplate deletes a template
func (tm *TemplateManager) DeleteTemplate(templateID string) error {
	template, exists := tm.templates[templateID]
	if !exists {
		return fmt.Errorf("template not found: %s", templateID)
	}

	// Delete file
	filename := tm.getTemplateFilename(template)
	filepath := filepath.Join(tm.templatesDir, filename)
	
	if err := os.Remove(filepath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete template file: %w", err)
	}

	// Remove from memory
	delete(tm.templates, templateID)

	return nil
}

// GetTemplateMetrics returns metrics about stored templates
func (tm *TemplateManager) GetTemplateMetrics() *TemplateMetrics {
	metrics := &TemplateMetrics{
		TotalTemplates:    len(tm.templates),
		TemplatesByDomain: make(map[string]int),
		TemplatesByType:   make(map[FormType]int),
		LastUpdated:       time.Now(),
	}

	totalSuccess := 0.0
	for _, template := range tm.templates {
		// Count by domain
		metrics.TemplatesByDomain[template.Domain]++

		// Count by type
		metrics.TemplatesByType[FormType(template.FormType)]++

		// Sum success rates
		totalSuccess += template.SuccessRate
	}

	// Calculate average success rate
	if len(tm.templates) > 0 {
		metrics.AverageSuccess = totalSuccess / float64(len(tm.templates))
	}

	return metrics
}

// ListTemplates returns all templates with optional filtering
func (tm *TemplateManager) ListTemplates(limit int, offset int) ([]*FormTemplate, error) {
	templates := make([]*FormTemplate, 0, len(tm.templates))
	
	for _, template := range tm.templates {
		templates = append(templates, template)
	}

	// Sort by last updated (newest first)
	sort.Slice(templates, func(i, j int) bool {
		return templates[i].LastUpdated.After(templates[j].LastUpdated)
	})

	// Apply pagination
	start := offset
	if start >= len(templates) {
		return []*FormTemplate{}, nil
	}

	end := start + limit
	if end > len(templates) {
		end = len(templates)
	}

	return templates[start:end], nil
}

// ExportTemplates exports templates to a JSON file
func (tm *TemplateManager) ExportTemplates(exportPath string) error {
	templates := make([]*FormTemplate, 0, len(tm.templates))
	for _, template := range tm.templates {
		templates = append(templates, template)
	}

	data, err := json.MarshalIndent(templates, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal templates: %w", err)
	}

	if err := ioutil.WriteFile(exportPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write export file: %w", err)
	}

	return nil
}

// ImportTemplates imports templates from a JSON file
func (tm *TemplateManager) ImportTemplates(importPath string) error {
	data, err := ioutil.ReadFile(importPath)
	if err != nil {
		return fmt.Errorf("failed to read import file: %w", err)
	}

	var templates []*FormTemplate
	if err := json.Unmarshal(data, &templates); err != nil {
		return fmt.Errorf("failed to unmarshal templates: %w", err)
	}

	// Save each template
	for _, template := range templates {
		if err := tm.SaveTemplate(template); err != nil {
			return fmt.Errorf("failed to save imported template %s: %w", template.ID, err)
		}
	}

	return nil
}

// CleanupOldTemplates removes templates older than the specified duration
func (tm *TemplateManager) CleanupOldTemplates(maxAge time.Duration) error {
	cutoff := time.Now().Add(-maxAge)
	var toDelete []string

	for id, template := range tm.templates {
		if template.LastUpdated.Before(cutoff) {
			toDelete = append(toDelete, id)
		}
	}

	for _, id := range toDelete {
		if err := tm.DeleteTemplate(id); err != nil {
			return fmt.Errorf("failed to delete old template %s: %w", id, err)
		}
	}

	return nil
}

// getTemplateFilename generates a filename for a template
func (tm *TemplateManager) getTemplateFilename(template *FormTemplate) string {
	// Sanitize domain name for filename
	domain := strings.ReplaceAll(template.Domain, ".", "_")
	domain = strings.ReplaceAll(domain, "/", "_")
	
	// Create filename with domain, type, and ID
	return fmt.Sprintf("%s_%s_%s.json", domain, template.FormType, template.ID)
}

// ValidateTemplate validates a template structure
func (tm *TemplateManager) ValidateTemplate(template *FormTemplate) error {
	if template.ID == "" {
		return fmt.Errorf("template ID is required")
	}

	if template.URL == "" {
		return fmt.Errorf("template URL is required")
	}

	if template.Domain == "" {
		return fmt.Errorf("template domain is required")
	}

	if len(template.Fields) == 0 {
		return fmt.Errorf("template must have at least one field")
	}

	// Validate each field
	for i, field := range template.Fields {
		if field.Name == "" && field.Label == "" {
			return fmt.Errorf("field %d must have either name or label", i)
		}

		if field.Selector == "" {
			return fmt.Errorf("field %d must have a selector", i)
		}
	}

	return nil
}

// GetTemplateByURL finds a template by exact URL match
func (tm *TemplateManager) GetTemplateByURL(url string) (*FormTemplate, error) {
	for _, template := range tm.templates {
		if template.URL == url {
			return template, nil
		}
	}

	return nil, fmt.Errorf("no template found for URL: %s", url)
}

// GetTemplatesByDomain finds all templates for a specific domain
func (tm *TemplateManager) GetTemplatesByDomain(domain string) ([]*FormTemplate, error) {
	var templates []*FormTemplate

	for _, template := range tm.templates {
		if template.Domain == domain {
			templates = append(templates, template)
		}
	}

	// Sort by success rate
	sort.Slice(templates, func(i, j int) bool {
		return templates[i].SuccessRate > templates[j].SuccessRate
	})

	return templates, nil
}