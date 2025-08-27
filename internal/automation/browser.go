package automation

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/playwright-community/playwright-go"
)

// BrowserManager handles browser instance lifecycle and resource management
type BrowserManager struct {
	pw          *playwright.Playwright
	browsers    []*playwright.Browser
	maxBrowsers int
	mutex       sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc
}

// BrowserConfig holds configuration for browser instances
type BrowserConfig struct {
	Headless         bool
	MaxBrowsers      int
	DefaultTimeout   time.Duration
	ViewportWidth    int
	ViewportHeight   int
	UserAgent        string
	DisableImages    bool
	DisableJavaScript bool
}

// DefaultBrowserConfig returns sensible defaults for browser configuration
func DefaultBrowserConfig() *BrowserConfig {
	return &BrowserConfig{
		Headless:         true,
		MaxBrowsers:      10,
		DefaultTimeout:   30 * time.Second,
		ViewportWidth:    1920,
		ViewportHeight:   1080,
		UserAgent:        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		DisableImages:    false,
		DisableJavaScript: false,
	}
}

// NewBrowserManager creates a new browser manager instance
func NewBrowserManager(config *BrowserConfig) (*BrowserManager, error) {
	if config == nil {
		config = DefaultBrowserConfig()
	}

	// Install Playwright if needed
	err := playwright.Install()
	if err != nil {
		return nil, fmt.Errorf("failed to install playwright: %w", err)
	}

	// Initialize Playwright
	pw, err := playwright.Run()
	if err != nil {
		return nil, fmt.Errorf("failed to start playwright: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	manager := &BrowserManager{
		pw:          pw,
		browsers:    make([]*playwright.Browser, 0, config.MaxBrowsers),
		maxBrowsers: config.MaxBrowsers,
		ctx:         ctx,
		cancel:      cancel,
	}

	// Pre-create browser instances
	for i := 0; i < config.MaxBrowsers; i++ {
		browser, err := manager.createBrowser(config)
		if err != nil {
			manager.Close()
			return nil, fmt.Errorf("failed to create browser %d: %w", i, err)
		}
		manager.browsers = append(manager.browsers, browser)
	}

	return manager, nil
}

// createBrowser creates a new browser instance with the given configuration
func (bm *BrowserManager) createBrowser(config *BrowserConfig) (*playwright.Browser, error) {
	launchOptions := playwright.BrowserTypeLaunchOptions{
		Headless: &config.Headless,
		Args: []string{
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-accelerated-2d-canvas",
			"--no-first-run",
			"--no-zygote",
			"--disable-gpu",
		},
	}

	if config.DisableImages {
		launchOptions.Args = append(launchOptions.Args, "--blink-settings=imagesEnabled=false")
	}

	if config.DisableJavaScript {
		launchOptions.Args = append(launchOptions.Args, "--disable-javascript")
	}

	browser, err := bm.pw.Chromium.Launch(launchOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to launch browser: %w", err)
	}

	return &browser, nil
}

// GetBrowser returns an available browser instance
func (bm *BrowserManager) GetBrowser() (*playwright.Browser, error) {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()

	if len(bm.browsers) == 0 {
		return nil, fmt.Errorf("no browsers available")
	}

	// Return the first available browser
	// In a more sophisticated implementation, we'd track which browsers are in use
	return bm.browsers[0], nil
}

// CreatePage creates a new page with default settings
func (bm *BrowserManager) CreatePage(config *BrowserConfig) (*playwright.Page, error) {
	browser, err := bm.GetBrowser()
	if err != nil {
		return nil, err
	}

	context, err := (*browser).NewContext(playwright.BrowserNewContextOptions{
		Viewport: &playwright.Size{
			Width:  config.ViewportWidth,
			Height: config.ViewportHeight,
		},
		UserAgent: &config.UserAgent,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create browser context: %w", err)
	}

	page, err := context.NewPage()
	if err != nil {
		return nil, fmt.Errorf("failed to create page: %w", err)
	}

	// Set default timeout
	page.SetDefaultTimeout(float64(config.DefaultTimeout.Milliseconds()))

	return &page, nil
}

// ExecuteInParallel executes multiple tasks in parallel using available browsers
func (bm *BrowserManager) ExecuteInParallel(tasks []func(*playwright.Page) error, config *BrowserConfig) []error {
	if config == nil {
		config = DefaultBrowserConfig()
	}

	results := make([]error, len(tasks))
	semaphore := make(chan struct{}, bm.maxBrowsers)
	var wg sync.WaitGroup

	for i, task := range tasks {
		wg.Add(1)
		go func(index int, taskFunc func(*playwright.Page) error) {
			defer wg.Done()

			// Acquire semaphore
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Create page for this task
			page, err := bm.CreatePage(config)
			if err != nil {
				results[index] = err
				return
			}
			defer (*page).Close()

			// Execute task
			results[index] = taskFunc(page)
		}(i, task)
	}

	wg.Wait()
	return results
}

// GetSystemResources returns current system resource usage
func (bm *BrowserManager) GetSystemResources() (*SystemResources, error) {
	// This is a placeholder implementation
	// In a real implementation, you'd use system monitoring libraries
	return &SystemResources{
		CPUUsage:      25.5,
		MemoryUsage:   45.2,
		ActiveBrowsers: len(bm.browsers),
		MaxBrowsers:   bm.maxBrowsers,
	}, nil
}

// SystemResources holds system resource information
type SystemResources struct {
	CPUUsage       float64
	MemoryUsage    float64
	ActiveBrowsers int
	MaxBrowsers    int
}

// OptimizeConcurrency adjusts the number of browsers based on system resources
func (bm *BrowserManager) OptimizeConcurrency() error {
	resources, err := bm.GetSystemResources()
	if err != nil {
		return err
	}

	// Simple optimization logic
	// In a real implementation, this would be more sophisticated
	if resources.CPUUsage > 80 || resources.MemoryUsage > 80 {
		// Reduce browser count
		if bm.maxBrowsers > 1 {
			bm.maxBrowsers--
		}
	} else if resources.CPUUsage < 50 && resources.MemoryUsage < 50 {
		// Increase browser count
		if bm.maxBrowsers < 20 {
			bm.maxBrowsers++
		}
	}

	return nil
}

// Close shuts down all browsers and cleans up resources
func (bm *BrowserManager) Close() error {
	bm.mutex.Lock()
	defer bm.mutex.Unlock()

	// Cancel context
	if bm.cancel != nil {
		bm.cancel()
	}

	// Close all browsers
	for _, browser := range bm.browsers {
		if browser != nil {
			(*browser).Close()
		}
	}

	// Stop Playwright
	if bm.pw != nil {
		return bm.pw.Stop()
	}

	return nil
}

// HealthCheck verifies that browsers are responsive
func (bm *BrowserManager) HealthCheck() error {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()

	for i, browser := range bm.browsers {
		if browser == nil {
			return fmt.Errorf("browser %d is nil", i)
		}

		// Try to create a context to verify browser is responsive
		ctx, err := (*browser).NewContext()
		if err != nil {
			return fmt.Errorf("browser %d is not responsive: %w", i, err)
		}
		ctx.Close()
	}

	return nil
}