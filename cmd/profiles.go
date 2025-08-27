package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"github.com/ai-form-filler/cli/internal/services"
	"github.com/ai-form-filler/cli/internal/ui"
)

// profilesCmd represents the profiles command
var profilesCmd = &cobra.Command{
	Use:   "profiles",
	Short: "Manage client profiles",
	Long: `Manage client profiles with a beautiful interactive interface.

This command launches an interactive terminal interface for creating, editing,
and managing client profiles. Profiles contain personal information used for
automated form filling.

Features:
- Create new profiles with encrypted storage
- Edit existing profiles
- Delete profiles with confirmation
- Beautiful terminal UI with Charm Bracelet components
- Real-time validation and error handling`,
	Run: runProfilesCommand,
}

func init() {
	rootCmd.AddCommand(profilesCmd)
}

func runProfilesCommand(cmd *cobra.Command, args []string) {
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

	// Create and run the profile manager
	model := ui.NewProfileManagerModel(profileService)
	
	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// getDataDirectory returns the data directory for storing profiles
func getDataDirectory() (string, error) {
	// Get user home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	// Create data directory path
	dataDir := filepath.Join(homeDir, ".ai-form-filler", "profiles")
	
	// Ensure directory exists
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create data directory: %w", err)
	}

	return dataDir, nil
}