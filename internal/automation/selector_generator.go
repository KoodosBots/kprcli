package automation

import (
	"context"
	"fmt"
	"strings"

	"github.com/playwright-community/playwright-go"
)

// SelectorGenerator generates and validates CSS selectors for form elements
type SelectorGenerator struct {
	strategies []SelectorStrategy
}

// SelectorStrategy represents a strategy for generating selectors
type SelectorStrategy interface {
	GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error)
	GetPriority() int
	GetName() string
}

// SelectorValidationResult represents the result of selector validation
type SelectorValidationResult struct {
	Selector    string  `json:"selector"`
	IsValid     bool    `json:"isValid"`
	IsUnique    bool    `json:"isUnique"`
	ElementCount int    `json:"elementCount"`
	Confidence  float64 `json:"confidence"`
}

// NewSelectorGenerator creates a new selector generator with default strategies
func NewSelectorGenerator() *SelectorGenerator {
	return &SelectorGenerator{
		strategies: []SelectorStrategy{
			&IDSelectorStrategy{},
			&NameSelectorStrategy{},
			&DataAttributeSelectorStrategy{},
			&ClassSelectorStrategy{},
			&XPathSelectorStrategy{},
			&CSSPathSelectorStrategy{},
		},
	}
}

// GenerateSelectors generates multiple selector options for an element
func (sg *SelectorGenerator) GenerateSelectors(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) ([]string, error) {
	var selectors []string

	for _, strategy := range sg.strategies {
		selector, err := strategy.GenerateSelector(ctx, page, element)
		if err != nil {
			continue // Skip failed strategies
		}
		if selector != "" {
			selectors = append(selectors, selector)
		}
	}

	return selectors, nil
}

// ValidateSelector validates if a selector uniquely identifies an element
func (sg *SelectorGenerator) ValidateSelector(ctx context.Context, page *playwright.Page, selector string) (*SelectorValidationResult, error) {
	script := fmt.Sprintf(`
		(function() {
			try {
				const elements = document.querySelectorAll('%s');
				return {
					elementCount: elements.length,
					isValid: elements.length > 0,
					isUnique: elements.length === 1
				};
			} catch (e) {
				return {
					elementCount: 0,
					isValid: false,
					isUnique: false
				};
			}
		})();
	`, strings.ReplaceAll(selector, "'", "\\'"))

	result, err := (*page).Evaluate(script)
	if err != nil {
		return &SelectorValidationResult{
			Selector: selector,
			IsValid:  false,
			IsUnique: false,
		}, err
	}

	resultMap, ok := result.(map[string]interface{})
	if !ok {
		return &SelectorValidationResult{
			Selector: selector,
			IsValid:  false,
			IsUnique: false,
		}, fmt.Errorf("unexpected result format")
	}

	elementCount := int(resultMap["elementCount"].(float64))
	isValid := resultMap["isValid"].(bool)
	isUnique := resultMap["isUnique"].(bool)

	// Calculate confidence based on uniqueness and validity
	confidence := 0.0
	if isValid {
		confidence = 50.0
		if isUnique {
			confidence = 100.0
		} else {
			// Reduce confidence based on number of matches
			confidence = 50.0 / float64(elementCount)
		}
	}

	return &SelectorValidationResult{
		Selector:     selector,
		IsValid:      isValid,
		IsUnique:     isUnique,
		ElementCount: elementCount,
		Confidence:   confidence,
	}, nil
}

// FindBestSelector finds the best selector from a list of candidates
func (sg *SelectorGenerator) FindBestSelector(ctx context.Context, page *playwright.Page, selectors []string) (string, error) {
	bestSelector := ""
	bestConfidence := 0.0

	for _, selector := range selectors {
		result, err := sg.ValidateSelector(ctx, page, selector)
		if err != nil {
			continue
		}

		if result.Confidence > bestConfidence {
			bestConfidence = result.Confidence
			bestSelector = selector
		}
	}

	if bestSelector == "" {
		return "", fmt.Errorf("no valid selector found")
	}

	return bestSelector, nil
}

// IDSelectorStrategy generates selectors based on element ID
type IDSelectorStrategy struct{}

func (s *IDSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	id, err := element.GetAttribute("id")
	if err != nil || id == "" {
		return "", nil
	}

	return fmt.Sprintf("#%s", id), nil
}

func (s *IDSelectorStrategy) GetPriority() int { return 100 }
func (s *IDSelectorStrategy) GetName() string { return "ID" }

// NameSelectorStrategy generates selectors based on name attribute
type NameSelectorStrategy struct{}

func (s *NameSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	name, err := element.GetAttribute("name")
	if err != nil || name == "" {
		return "", nil
	}

	return fmt.Sprintf("[name=\"%s\"]", name), nil
}

func (s *NameSelectorStrategy) GetPriority() int { return 90 }
func (s *NameSelectorStrategy) GetName() string { return "Name" }

// DataAttributeSelectorStrategy generates selectors based on data attributes
type DataAttributeSelectorStrategy struct{}

func (s *DataAttributeSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	dataAttrs := []string{"data-name", "data-field", "data-testid", "data-cy", "data-test"}
	
	for _, attr := range dataAttrs {
		value, err := element.GetAttribute(attr)
		if err != nil || value == "" {
			continue
		}
		return fmt.Sprintf("[%s=\"%s\"]", attr, value), nil
	}

	return "", nil
}

func (s *DataAttributeSelectorStrategy) GetPriority() int { return 80 }
func (s *DataAttributeSelectorStrategy) GetName() string { return "DataAttribute" }

// ClassSelectorStrategy generates selectors based on CSS classes
type ClassSelectorStrategy struct{}

func (s *ClassSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	className, err := element.GetAttribute("class")
	if err != nil || className == "" {
		return "", nil
	}

	// Filter out framework-specific and dynamic classes
	classes := strings.Fields(className)
	var validClasses []string

	for _, class := range classes {
		if s.isValidClass(class) {
			validClasses = append(validClasses, class)
		}
	}

	if len(validClasses) == 0 {
		return "", nil
	}

	return fmt.Sprintf(".%s", strings.Join(validClasses, ".")), nil
}

func (s *ClassSelectorStrategy) isValidClass(class string) bool {
	// Filter out framework-specific classes
	excludePatterns := []string{
		"ng-", "v-", "react-", "vue-", // Framework classes
		"css-", "sc-", "emotion-",     // CSS-in-JS classes
		"MuiButton", "ant-",           // UI library classes
	}

	for _, pattern := range excludePatterns {
		if strings.Contains(class, pattern) {
			return false
		}
	}

	// Exclude very long classes (likely generated)
	if len(class) > 20 {
		return false
	}

	return true
}

func (s *ClassSelectorStrategy) GetPriority() int { return 70 }
func (s *ClassSelectorStrategy) GetName() string { return "Class" }

// XPathSelectorStrategy generates XPath selectors
type XPathSelectorStrategy struct{}

func (s *XPathSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	// Generate XPath using JavaScript
	script := `
		(function(element) {
			function getXPath(element) {
				if (element.id) {
					return '//*[@id="' + element.id + '"]';
				}
				
				const path = [];
				let current = element;
				
				while (current && current !== document.documentElement) {
					const tagName = current.tagName.toLowerCase();
					const siblings = Array.from(current.parentElement?.children || [])
						.filter(sibling => sibling.tagName.toLowerCase() === tagName);
					
					if (siblings.length > 1) {
						const index = siblings.indexOf(current) + 1;
						path.unshift(tagName + '[' + index + ']');
					} else {
						path.unshift(tagName);
					}
					
					current = current.parentElement;
				}
				
				return '//' + path.join('/');
			}
			
			return getXPath(arguments[0]);
		})
	`

	result, err := (*page).Evaluate(script, element)
	if err != nil {
		return "", err
	}

	if xpath, ok := result.(string); ok {
		return xpath, nil
	}

	return "", nil
}

func (s *XPathSelectorStrategy) GetPriority() int { return 60 }
func (s *XPathSelectorStrategy) GetName() string { return "XPath" }

// CSSPathSelectorStrategy generates CSS path selectors
type CSSPathSelectorStrategy struct{}

func (s *CSSPathSelectorStrategy) GenerateSelector(ctx context.Context, page *playwright.Page, element playwright.ElementHandle) (string, error) {
	// Generate CSS path using JavaScript
	script := `
		(function(element) {
			function getCSSPath(element) {
				const path = [];
				let current = element;
				
				while (current && current !== document.body) {
					let selector = current.tagName.toLowerCase();
					
					// Add classes if available and not too generic
					const classes = Array.from(current.classList).filter(cls => 
						!cls.includes('ng-') && !cls.includes('v-') && cls.length < 20
					);
					if (classes.length > 0 && classes.length < 4) {
						selector += '.' + classes.join('.');
					}
					
					// Add nth-child if needed for uniqueness
					const siblings = Array.from(current.parentElement?.children || [])
						.filter(sibling => sibling.tagName === current.tagName);
					if (siblings.length > 1) {
						const index = siblings.indexOf(current) + 1;
						selector += ':nth-child(' + index + ')';
					}
					
					path.unshift(selector);
					current = current.parentElement;
				}
				
				return path.join(' > ');
			}
			
			return getCSSPath(arguments[0]);
		})
	`

	result, err := (*page).Evaluate(script, element)
	if err != nil {
		return "", err
	}

	if cssPath, ok := result.(string); ok {
		return cssPath, nil
	}

	return "", nil
}

func (s *CSSPathSelectorStrategy) GetPriority() int { return 50 }
func (s *CSSPathSelectorStrategy) GetName() string { return "CSSPath" }

// OptimizeSelectors optimizes a list of selectors by testing them and ranking by reliability
func (sg *SelectorGenerator) OptimizeSelectors(ctx context.Context, page *playwright.Page, selectors []string) ([]string, error) {
	type selectorScore struct {
		selector   string
		confidence float64
	}

	var scores []selectorScore

	for _, selector := range selectors {
		result, err := sg.ValidateSelector(ctx, page, selector)
		if err != nil {
			continue
		}

		if result.IsValid {
			scores = append(scores, selectorScore{
				selector:   selector,
				confidence: result.Confidence,
			})
		}
	}

	// Sort by confidence (highest first)
	for i := 0; i < len(scores)-1; i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].confidence > scores[i].confidence {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	// Extract sorted selectors
	optimizedSelectors := make([]string, len(scores))
	for i, score := range scores {
		optimizedSelectors[i] = score.selector
	}

	return optimizedSelectors, nil
}

// TestSelectorStability tests if a selector remains stable across page reloads
func (sg *SelectorGenerator) TestSelectorStability(ctx context.Context, page *playwright.Page, selector string, iterations int) (float64, error) {
	successCount := 0

	for i := 0; i < iterations; i++ {
		// Reload the page
		_, err := (*page).Reload(playwright.PageReloadOptions{
			WaitUntil: playwright.WaitUntilStateNetworkidle,
		})
		if err != nil {
			continue
		}

		// Test the selector
		result, err := sg.ValidateSelector(ctx, page, selector)
		if err != nil {
			continue
		}

		if result.IsValid && result.IsUnique {
			successCount++
		}
	}

	stability := float64(successCount) / float64(iterations) * 100
	return stability, nil
}