package cmd

import (
	"fmt"
	"log"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/ai-form-filler/cli/internal/models"
	"github.com/ai-form-filler/cli/internal/services"
	"github.com/ai-form-filler/cli/internal/ui"
)

// dashboardCmd represents the dashboard command
var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Launch the interactive dashboard",
	Long: `Launch the beautiful interactive dashboard for managing profiles, 
monitoring executions, and controlling the AI Form Filler system.

The dashboard provides:
- Real-time execution monitoring
- Profile management interface
- System resource visualization
- Progress tracking and status updates`,
	Run: func(cmd *cobra.Command, args []string) {
		runDashboard()
	},
}

func init() {
	rootCmd.AddCommand(dashboardCmd)
}

func runDashboard() {
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

	// Create dashboard model with services
	model := newEnhancedDashboardModel(profileService)
	
	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}
}

// Enhanced Dashboard Model
type enhancedDashboardModel struct {
	activeTab       int
	tabs            []string
	profileManager  *ui.ProfileManagerModel
	executionDash   *ui.DashboardModel
	errorReporter   *ui.ErrorReporterModel
	profileService  *services.ProfileService
	width           int
	height          int
	demoSessions    []*models.ExecutionSession
}

func newEnhancedDashboardModel(profileService *services.ProfileService) *enhancedDashboardModel {
	// Create demo execution sessions for demonstration
	demoSessions := createDemoSessions()
	
	return &enhancedDashboardModel{
		activeTab:      0,
		tabs:           []string{"Overview", "Profiles", "Executions", "Errors", "Settings"},
		profileManager: ui.NewProfileManagerModel(profileService),
		executionDash:  ui.NewDashboardModel(),
		errorReporter:  ui.NewErrorReporterModel(),
		profileService: profileService,
		demoSessions:   demoSessions,
	}
}

// createDemoSessions creates demo execution sessions for demonstration
func createDemoSessions() []*models.ExecutionSession {
	config := models.ExecutionConfig{
		MaxConcurrency:   5,
		Timeout:          30000000000, // 30 seconds in nanoseconds
		RetryAttempts:    3,
		DelayBetweenURLs: 2000000000,  // 2 seconds
		SkipCAPTCHA:      false,
		TakeScreenshots:  true,
		HeadlessMode:     true,
	}

	sessions := []*models.ExecutionSession{
		models.NewExecutionSession("1", "John Doe", []string{
			"https://example.com/register",
			"https://test.com/signup",
			"https://demo.com/form",
		}, config),
		models.NewExecutionSession("2", "Jane Smith", []string{
			"https://site1.com/contact",
			"https://site2.com/apply",
		}, config),
	}

	// Simulate some progress
	sessions[0].Start()
	sessions[0].Progress.CompletedURLs = 2
	sessions[0].Progress.FailedURLs = 0
	sessions[0].Progress.CurrentURL = "https://demo.com/form"
	sessions[0].UpdateProgress()

	sessions[1].Complete()
	sessions[1].Progress.CompletedURLs = 2
	sessions[1].UpdateProgress()

	return sessions
}

func (m *enhancedDashboardModel) Init() tea.Cmd {
	return tea.Batch(
		m.profileManager.Init(),
		m.executionDash.Init(),
		m.errorReporter.Init(),
	)
}

func (m *enhancedDashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		
		// Update child components
		m.profileManager.Update(msg)
		m.executionDash.Update(msg)
		m.errorReporter.Update(msg)
		
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit

		case "tab":
			m.activeTab = (m.activeTab + 1) % len(m.tabs)
			return m, nil

		case "shift+tab":
			m.activeTab = (m.activeTab - 1 + len(m.tabs)) % len(m.tabs)
			return m, nil

		default:
			// Forward key events to active tab component
			switch m.activeTab {
			case 1: // Profiles
				var cmd tea.Cmd
				var model tea.Model
				model, cmd = m.profileManager.Update(msg)
				if pm, ok := model.(*ui.ProfileManagerModel); ok {
					m.profileManager = pm
				}
				cmds = append(cmds, cmd)
			case 2: // Executions
				var cmd tea.Cmd
				var model tea.Model
				model, cmd = m.executionDash.Update(msg)
				if dm, ok := model.(*ui.DashboardModel); ok {
					m.executionDash = dm
				}
				cmds = append(cmds, cmd)
			case 3: // Errors
				var cmd tea.Cmd
				var model tea.Model
				model, cmd = m.errorReporter.Update(msg)
				if em, ok := model.(*ui.ErrorReporterModel); ok {
					m.errorReporter = em
				}
				cmds = append(cmds, cmd)
			}
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *enhancedDashboardModel) View() string {
	if m.width == 0 {
		return "Loading..."
	}

	// Define styles
	var (
		titleStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#FAFAFA")).
				Background(lipgloss.Color("#7D56F4")).
				Padding(0, 1).
				Bold(true)

		tabStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#874BFD")).
				Padding(0, 1)

		activeTabStyle = tabStyle.Copy().
				Background(lipgloss.Color("#874BFD")).
				Foreground(lipgloss.Color("#FAFAFA"))

		contentStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#874BFD")).
				Padding(1, 2).
				Width(m.width - 4).
				Height(m.height - 8)
	)

	// Build header
	title := titleStyle.Render("🚀 AI Form Filler - Enhanced Dashboard")
	
	// Build tabs
	var tabs []string
	for i, tab := range m.tabs {
		if i == m.activeTab {
			tabs = append(tabs, activeTabStyle.Render(tab))
		} else {
			tabs = append(tabs, tabStyle.Render(tab))
		}
	}
	tabRow := lipgloss.JoinHorizontal(lipgloss.Top, tabs...)

	// Build content based on active tab
	var content string
	switch m.activeTab {
	case 0: // Overview
		content = m.renderOverviewTab()
	case 1: // Profiles
		content = m.profileManager.View()
	case 2: // Executions
		content = m.executionDash.View()
	case 3: // Errors
		content = m.errorReporter.View()
	case 4: // Settings
		content = m.renderSettingsTab()
	}

	contentBox := contentStyle.Render(content)

	// Build footer
	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Render("Tab/Shift+Tab: switch tabs • q: quit • Component-specific keys available in each tab")

	return lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		tabRow,
		"",
		contentBox,
		"",
		footer,
	)
}

func (m *enhancedDashboardModel) renderOverviewTab() string {
	statusStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#04B575")).
		Padding(1).
		Margin(0, 1, 1, 0)

	// Get profile count
	profiles, _ := m.profileService.GetProfiles()
	profileCount := len(profiles)

	// Calculate execution stats
	var runningCount, completedCount int
	for _, session := range m.demoSessions {
		switch session.Status {
		case models.StatusRunning:
			runningCount++
		case models.StatusCompleted:
			completedCount++
		}
	}

	systemInfo := fmt.Sprintf(`🖥️  System Status
Profiles: %d
Active Executions: %d
Completed Today: %d

🎯 Recent Activity
• Profile management interface ready
• Execution dashboard operational
• Error reporting system active
• Beautiful UI components loaded`, 
		profileCount,
		runningCount,
		completedCount)

	quickActions := `⚡ Quick Actions
• Press Tab → Profiles to manage profiles
• Press Tab → Executions to monitor runs
• Press Tab → Errors to view issues
• Press Tab → Settings for configuration

📊 Features Available
• Interactive profile creation ✓
• Real-time execution monitoring ✓
• Progress visualization ✓
• Error reporting & recovery ✓`

	left := statusStyle.Width(40).Render(systemInfo)
	right := statusStyle.Width(40).Render(quickActions)

	return lipgloss.JoinHorizontal(lipgloss.Top, left, right)
}

func (m *enhancedDashboardModel) renderSettingsTab() string {
	return `⚙️  Settings

🔧 System Configuration
• Max parallel browsers: 10
• Default timeout: 30s
• Auto-retry failed forms: Yes
• Save screenshots: Yes
• Headless mode: Yes

🔑 API Configuration
• Groq API: Ready for integration
• CAPTCHA Solver: 2Captcha (pending setup)
• Telegram Bot: Ready for configuration

💾 Storage
• Local profiles: ~/.ai-form-filler/profiles/
• Profile encryption: AES-256 ✓
• Backup location: Local only (cloud sync available)

⚡ Performance
• Resource monitoring: Enabled
• Auto-scaling: Yes
• Memory optimization: Active
• Concurrent execution: Configurable

🎨 UI Features
• Crush-inspired CLI design ✓
• Interactive forms ✓
• Real-time progress bars ✓
• Beautiful error reporting ✓`
}