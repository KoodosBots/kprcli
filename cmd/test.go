package cmd

import (
	"context"
	"fmt"
	"log"

	"github.com/ai-form-filler/cli/internal/automation"
	"github.com/ai-form-filler/cli/internal/models"
	"github.com/spf13/cobra"
)

var testCmd = &cobra.Command{
	Use:   "test",
	Short: "Test form filling functionality",
	Long:  "Test the form detection and filling capabilities on a sample page",
	Run:   runTest,
}

func init() {
	rootCmd.AddCommand(testCmd)
	testCmd.Flags().StringP("url", "u", "file://./test-form.html", "URL to test")
	testCmd.Flags().BoolP("headless", "h", false, "Run in headless mode")
}

func runTest(cmd *cobra.Command, args []string) {
	url, _ := cmd.Flags().GetString("url")
	headless, _ := cmd.Flags().GetBool("headless")

	fmt.Printf("Testing form filling on: %s\n", url)

	// Create browser manager
	browserConfig := automation.DefaultBrowserConfig()
	browserConfig.Headless = headless

	browserManager, err := automation.NewBrowserManager(browserConfig)
	if err != nil {
		log.Fatalf("Failed to create browser manager: %v", err)
	}
	defer browserManager.Close()

	// Create form detector
	formDetector := automation.NewFormDetector(browserManager, nil)

	// Analyze the page
	ctx := context.Background()
	analysis, err := formDetector.AnalyzePage(ctx, url)
	if err != nil {
		log.Fatalf("Failed to analyze page: %v", err)
	}

	fmt.Printf("Analysis Results:\n")
	fmt.Printf("- Found %d forms\n", len(analysis.Forms))
	fmt.Printf("- Total fields: %d\n", analysis.TotalFields)
	fmt.Printf("- Overall confidence: %.1f%%\n", analysis.Confidence)
	fmt.Printf("- Analysis time: %v\n", analysis.AnalysisTime)

	for i, form := range analysis.Forms {
		fmt.Printf("\nForm %d:\n", i+1)
		fmt.Printf("  - Type: %s\n", form.FormType)
		fmt.Printf("  - Confidence: %.1f%%\n", form.Confidence)
		fmt.Printf("  - Fields: %d\n", len(form.Fields))
		fmt.Printf("  - Submit buttons: %d\n", len(form.SubmitButtons))

		for j, field := range form.Fields {
			fmt.Printf("    Field %d: %s (%s) - %s\n", j+1, field.Name, field.Type, field.Label)
		}
	}

	// Test profile filling if forms were found
	if len(analysis.Forms) > 0 {
		fmt.Printf("\nTesting profile-based form filling...\n")

		// Create test profile
		testProfile := &models.ClientProfile{
			ID:   "test-profile",
			Name: "Test Profile",
			PersonalData: models.PersonalData{
				FirstName: "John",
				LastName:  "Doe",
				Email:     "john.doe@example.com",
				Phone:     "+1-555-123-4567",
				Address: models.Address{
					Street1:    "123 Main Street",
					City:       "Anytown",
					State:      "CA",
					PostalCode: "12345",
					Country:    "US",
				},
			},
		}

		// Create template manager and profile form filler
		templateManager, err := automation.NewTemplateManager("./templates")
		if err != nil {
			log.Printf("Warning: Failed to create template manager: %v", err)
			return
		}

		formFiller := automation.NewFormFiller(browserManager, nil)
		profileFormFiller := automation.NewProfileFormFiller(formFiller, formDetector, templateManager, nil)

		// Test filling
		result, err := profileFormFiller.FillFormWithProfile(ctx, url, testProfile)
		if err != nil {
			log.Printf("Form filling failed: %v", err)
			return
		}

		fmt.Printf("Fill Results:\n")
		fmt.Printf("- Success: %v\n", result.Success)
		fmt.Printf("- Fields filled: %d/%d\n", result.FilledFields, result.TotalFields)
		fmt.Printf("- Confidence: %.1f%%\n", result.Confidence)
		fmt.Printf("- Execution time: %v\n", result.ExecutionTime)
		fmt.Printf("- Unmapped fields: %v\n", result.UnmappedFields)

		if len(result.Errors) > 0 {
			fmt.Printf("- Errors: %v\n", result.Errors)
		}
	}
}