package cmd

import (
	"fmt"
	"os"

	"github.com/ai-form-filler/cli/internal/automation"
	"github.com/spf13/cobra"
)

// systemScanCmd represents the system-scan command
var systemScanCmd = &cobra.Command{
	Use:   "system-scan",
	Short: "Scan system specifications and determine optimal performance settings",
	Long: `Scans your system hardware specifications and determines the optimal
number of concurrent browser instances your system can handle.

This command is typically run during installation but can be run
manually at any time to re-evaluate system capabilities.`,
	Run: runSystemScan,
}

func init() {
	rootCmd.AddCommand(systemScanCmd)
}

func runSystemScan(cmd *cobra.Command, args []string) {
	fmt.Println("Scanning system specifications...")
	
	spec, err := automation.ScanSystemSpecifications()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error scanning system: %v\n", err)
		os.Exit(1)
	}
	
	// Print human-readable summary
	summary := automation.GetSystemSpecSummary(spec)
	fmt.Println(summary)
	
	// Save configuration
	config := automation.DefaultExecutionConfig()
	config.MaxConcurrency = spec.OptimalSites
	
	// Save to config file
	configDir, err := getDataDirectory()
	if err == nil {
		filePath := configDir + "/system-config.json"
		err = automation.SaveExecutionConfig(config, filePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Could not save configuration: %v\n", err)
		} else {
			fmt.Printf("Configuration saved to: %s\n", filePath)
		}
	}
}