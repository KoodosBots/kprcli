package cmd

import (
	"fmt"
	"os"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"github.com/ai-form-filler/cli/internal/automation"
	"github.com/ai-form-filler/cli/internal/models"
	"github.com/ai-form-filler/cli/internal/services"
	"github.com/ai-form-filler/cli/internal/ui"
)

// executeCmd represents the execute command
var executeCmd = &cobra.Command{
	Use:   "execute [profile-name]",
	Short: "Execute form filling with a profile",
	Long: `Execute automated form filling using a specified profile.

This command starts the execution engine and fills forms on the provided URLs
using the selected profile data. The execution runs with parallel processing
and real-time progress monitoring.

Examples:
  ai-form-filler execute "John Doe"
  ai-form-filler execute --urls "https://example.com/form,https://test.com/signup"
  ai-form-filler execute --profile "Jane Smith" --concurrency 5`,
	Args: cobra.MaximumNArgs(1),
	Run:  runExecuteCommand,
}

var (
	executeURLs        string
	executeConcurrency int
	executeHeadless    bool
	executeTimeout     int
	executeProfile     string
)

func init() {
	rootCmd.AddCommand(executeCmd)

	executeCmd.Flags().StringVar(&executeURLs, "urls", "", "Comma-separated list of URLs to process")
	executeCmd.Flags().IntVar(&executeConcurrency, "concurrency", 0, "Maximum concurrent browsers (0 = auto-detect)")
	executeCmd.Flags().BoolVar(&executeHeadless, "headless", true, "Run browsers in headless mode")
	executeCmd.Flags().IntVar(&executeTimeout, "timeout", 30, "Timeout in seconds for each form")
	executeCmd.Flags().StringVar(&executeProfile, "profile", "", "Profile name to use (overrides positional argument)")
}

func runExecuteCommand(cmd *cobra.Command, args []string) {
	// Determine profile name
	profileName := executeProfile
	if profileName == "" && len(args) > 0 {
		profileName = args[0]
	}

	if profileName == "" {
		fmt.Fprintf(os.Stderr, "Error: Profile name is required\n")
		fmt.Fprintf(os.Stderr, "Usage: %s execute [profile-name] or use --profile flag\n", cmd.Root().Name())
		os.Exit(1)
	}

	// Get data directory
	dataDir, err := getDataDirectory()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to get data directory: %v\n", err)
		os.Exit(1)
	}

	// Create profile service
	profileService, err := services.NewProfileService(dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize profile service: %v\n", err)
		os.Exit(1)
	}

	// Get profile
	profile, err := profileService.GetProfileByName(profileName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Profile '%s' not found: %v\n", profileName, err)
		os.Exit(1)
	}

	// Parse URLs
	urls := parseURLs(executeURLs)
	if len(urls) == 0 {
		// Use demo URLs if none provided
		urls = []string{
			"https://httpbin.org/forms/post",
			"https://example.com/contact",
			"https://demo.testfire.net/register.jsp",
		}
		fmt.Printf("No URLs provided, using demo URLs: %v\n", urls)
	}

	// Create execution configuration
	// In the runExecuteCommand function, after creating the execution configuration
	config := automation.DefaultExecutionConfig()
	
	// Try to load system-specific configuration
	configDir, err := getDataDirectory()
	if err == nil {
	systemConfigPath := configDir + "/system-config.json"
	if _, err := os.Stat(systemConfigPath); err == nil {
	// File exists, try to load it
	systemConfig, err := automation.LoadExecutionConfig(systemConfigPath)
	if err == nil && systemConfig != nil {
	// Use system-specific concurrency if not overridden by command line
	if executeConcurrency == 0 {
	config.MaxConcurrency = systemConfig.MaxConcurrency
	fmt.Printf("Using system-optimized concurrency: %d\n", config.MaxConcurrency)
	}
	}
	}
	
	// Override with command line if specified
	if executeConcurrency > 0 {
	config.MaxConcurrency = executeConcurrency
	}
	config.DefaultTimeout = time.Duration(executeTimeout) * time.Second

	// Create browser configuration
	browserConfig := automation.DefaultBrowserConfig()
	browserConfig.Headless = executeHeadless
	browserConfig.MaxBrowsers = config.MaxConcurrency

	// Initialize browser manager
	fmt.Println("Initializing browser automation engine...")
	browserManager, err := automation.NewBrowserManager(browserConfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize browser manager: %v\n", err)
		os.Exit(1)
	}
	defer browserManager.Close()

	// Initialize execution engine
	executionEngine, err := automation.NewExecutionEngine(browserManager, config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize execution engine: %v\n", err)
		os.Exit(1)
	}
	defer executionEngine.Close()

	// Create execution session
	sessionConfig := models.ExecutionConfig{
		MaxConcurrency:   config.MaxConcurrency,
		Timeout:          config.DefaultTimeout,
		RetryAttempts:    config.RetryAttempts,
		DelayBetweenURLs: config.DelayBetweenJobs,
		SkipCAPTCHA:      false,
		TakeScreenshots:  config.EnableScreenshots,
		HeadlessMode:     browserConfig.Headless,
	}

	session := models.NewExecutionSession(profile.ID, profile.Name, urls, sessionConfig)

	// Convert profile to automation format
	profileData := &automation.ProfileData{
		FirstName: profile.PersonalData.FirstName,
		LastName:  profile.PersonalData.LastName,
		Email:     profile.PersonalData.Email,
		Phone:     profile.PersonalData.Phone,
		Address: automation.Address{
			Street:  profile.PersonalData.Address.Street1,
			City:    profile.PersonalData.Address.City,
			State:   profile.PersonalData.Address.State,
			ZipCode: profile.PersonalData.Address.PostalCode,
			Country: profile.PersonalData.Address.Country,
		},
	}

	// Create basic templates for URLs (in a real implementation, these would be loaded from storage)
	templates := make(map[string]*automation.FormTemplate)
	for _, url := range urls {
		templates[url] = &automation.FormTemplate{
			ID:     fmt.Sprintf("auto_%s", url),
			URL:    url,
			Fields: []automation.FormField{}, // Will be detected dynamically
		}
	}

	// Create progress view
	progressView := ui.NewProgressViewModel(session)

	// Start execution in background
	go func() {
		fmt.Printf("Starting execution for profile '%s' on %d URLs...\n", profileName, len(urls))
		err := executionEngine.ExecuteSession(session, profileData, templates)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Execution error: %v\n", err)
		}
	}()

	// Run progress view
	p := tea.NewProgram(progressView, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running progress view: %v\n", err)
		os.Exit(1)
	}

	// Print final results
	printExecutionResults(session)
}

// parseURLs parses a comma-separated list of URLs
func parseURLs(urlsStr string) []string {
	if urlsStr == "" {
		return []string{}
	}

	urls := make([]string, 0)
	for _, url := range splitString(urlsStr, ",") {
		trimmed := trimString(url)
		if trimmed != "" {
			urls = append(urls, trimmed)
		}
	}
	return urls
}

// splitString splits a string by delimiter
func splitString(s, delimiter string) []string {
	if s == "" {
		return []string{}
	}

	parts := make([]string, 0)
	current := ""
	
	for _, char := range s {
		if string(char) == delimiter {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(char)
		}
	}
	
	if current != "" {
		parts = append(parts, current)
	}
	
	return parts
}

// trimString removes leading and trailing whitespace
func trimString(s string) string {
	// Simple trim implementation
	start := 0
	end := len(s)
	
	// Trim leading whitespace
	for start < len(s) && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	
	// Trim trailing whitespace
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	
	return s[start:end]
}

// printExecutionResults prints the final execution results
func printExecutionResults(session *models.ExecutionSession) {
	fmt.Printf("\n=== Execution Results ===\n")
	fmt.Printf("Profile: %s\n", session.ProfileName)
	fmt.Printf("Status: %s\n", session.Status)
	fmt.Printf("Duration: %s\n", session.GetDuration())
	fmt.Printf("URLs Processed: %d/%d\n", 
		session.Progress.CompletedURLs+session.Progress.FailedURLs, 
		session.Progress.TotalURLs)
	fmt.Printf("Success Rate: %.1f%%\n", session.GetSuccessRate())
	
	if len(session.Results) > 0 {
		fmt.Printf("\nResults:\n")
		for _, result := range session.Results {
			status := "✅"
			if result.Status != "success" {
				status = "❌"
			}
			fmt.Printf("  %s %s (%d/%d fields, %s)\n", 
				status, result.URL, result.FilledFields, result.TotalFields, result.ExecutionTime)
		}
	}
	
	if len(session.Errors) > 0 {
		fmt.Printf("\nErrors:\n")
		for _, err := range session.Errors {
			fmt.Printf("  ❌ %s: %s\n", err.URL, err.Message)
		}
	}
}