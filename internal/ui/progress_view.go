package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/ai-form-filler/cli/internal/models"
)

// ProgressViewModel represents a progress visualization for a single execution
type ProgressViewModel struct {
	session       *models.ExecutionSession
	mainProgress  progress.Model
	urlProgress   map[string]progress.Model
	spinner       spinner.Model
	width         int
	height        int
	showURLs      bool
	animationTick int
}

// ProgressUpdateMsg updates the progress view
type ProgressUpdateMsg struct {
	Session *models.ExecutionSession
}

// NewProgressViewModel creates a new progress view model
func NewProgressViewModel(session *models.ExecutionSession) *ProgressViewModel {
	// Create main progress bar
	mainProg := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(40),
		progress.WithoutPercentage(),
	)

	// Create spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	return &ProgressViewModel{
		session:      session,
		mainProgress: mainProg,
		urlProgress:  make(map[string]progress.Model),
		spinner:      s,
		showURLs:     true,
	}
}

// Init initializes the progress view
func (m *ProgressViewModel) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.tickCmd(),
	)
}

// Update handles messages
func (m *ProgressViewModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.mainProgress.Width = msg.Width - 20

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "u":
			m.showURLs = !m.showURLs
		}

	case ProgressUpdateMsg:
		m.session = msg.Session
		m.updateProgress()

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case progressTickMsg:
		m.animationTick++
		cmds = append(cmds, m.tickCmd())
	}

	return m, tea.Batch(cmds...)
}

// View renders the progress view
func (m *ProgressViewModel) View() string {
	if m.session == nil {
		return "No execution session"
	}

	var content strings.Builder

	// Header
	content.WriteString(m.renderHeader())
	content.WriteString("\n\n")

	// Main progress
	content.WriteString(m.renderMainProgress())
	content.WriteString("\n\n")

	// Statistics
	content.WriteString(m.renderStatistics())
	content.WriteString("\n\n")

	// Current activity
	content.WriteString(m.renderCurrentActivity())
	content.WriteString("\n")

	// URL progress (if enabled)
	if m.showURLs {
		content.WriteString(m.renderURLProgress())
		content.WriteString("\n")
	}

	// Recent results
	content.WriteString(m.renderRecentResults())
	content.WriteString("\n")

	// Help
	content.WriteString(progressHelpStyle.Render("• u: toggle URL details • q: quit"))

	return content.String()
}

// renderHeader renders the session header
func (m *ProgressViewModel) renderHeader() string {
	title := fmt.Sprintf("Execution Progress - %s", m.session.ProfileName)
	
	var statusIcon string
	switch m.session.Status {
	case models.StatusRunning:
		statusIcon = m.spinner.View()
	case models.StatusCompleted:
		statusIcon = "✅"
	case models.StatusFailed:
		statusIcon = "❌"
	case models.StatusPaused:
		statusIcon = "⏸️"
	case models.StatusCancelled:
		statusIcon = "🚫"
	default:
		statusIcon = "⏳"
	}

	header := fmt.Sprintf("%s %s", statusIcon, title)
	return progressTitleStyle.Render(header)
}

// renderMainProgress renders the main progress bar
func (m *ProgressViewModel) renderMainProgress() string {
	var content strings.Builder

	// Progress bar
	progressPercent := m.session.Progress.Percentage / 100.0
	m.mainProgress.SetPercent(progressPercent)
	
	content.WriteString("Overall Progress:\n")
	content.WriteString(m.mainProgress.View())
	content.WriteString(fmt.Sprintf(" %.1f%%", m.session.Progress.Percentage))
	
	// Time information
	duration := m.session.GetDuration()
	content.WriteString(fmt.Sprintf("\nElapsed: %s", m.formatDuration(duration)))
	
	if m.session.Progress.Percentage > 0 && m.session.Status == models.StatusRunning {
		estimatedTotal := time.Duration(float64(duration) / (m.session.Progress.Percentage / 100.0))
		remaining := estimatedTotal - duration
		if remaining > 0 {
			content.WriteString(fmt.Sprintf(" • Remaining: ~%s", m.formatDuration(remaining)))
		}
	}

	return content.String()
}

// renderStatistics renders execution statistics
func (m *ProgressViewModel) renderStatistics() string {
	stats := []string{
		fmt.Sprintf("Total URLs: %d", m.session.Progress.TotalURLs),
		fmt.Sprintf("Completed: %d", m.session.Progress.CompletedURLs),
		fmt.Sprintf("Failed: %d", m.session.Progress.FailedURLs),
		fmt.Sprintf("Skipped: %d", m.session.Progress.SkippedURLs),
		fmt.Sprintf("Success Rate: %.1f%%", m.session.GetSuccessRate()),
	}

	return progressStatsStyle.Render("📊 " + strings.Join(stats, " • "))
}

// renderCurrentActivity renders current activity information
func (m *ProgressViewModel) renderCurrentActivity() string {
	if m.session.Status != models.StatusRunning {
		return ""
	}

	var activity string
	if m.session.Progress.CurrentURL != "" {
		activity = fmt.Sprintf("Currently processing: %s", m.session.Progress.CurrentURL)
	} else {
		activity = "Preparing next URL..."
	}

	// Add animated dots for running state
	dots := strings.Repeat(".", (m.animationTick%4)+1)
	activity += dots

	return progressActivityStyle.Render("🔄 " + activity)
}

// renderURLProgress renders individual URL progress
func (m *ProgressViewModel) renderURLProgress() string {
	if len(m.session.Results) == 0 {
		return ""
	}

	var content strings.Builder
	content.WriteString(progressSectionStyle.Render("URL Progress:"))
	content.WriteString("\n")

	// Show last 5 results
	start := 0
	if len(m.session.Results) > 5 {
		start = len(m.session.Results) - 5
	}

	for i := start; i < len(m.session.Results); i++ {
		result := m.session.Results[i]
		
		var statusIcon string
		var statusStyle lipgloss.Style
		
		switch result.Status {
		case "success":
			statusIcon = "✅"
			statusStyle = successTextStyle
		case "failure":
			statusIcon = "❌"
			statusStyle = errorTextStyle
		case "partial":
			statusIcon = "⚠️"
			statusStyle = warningTextStyle
		case "skipped":
			statusIcon = "⏭️"
			statusStyle = skippedTextStyle
		default:
			statusIcon = "❓"
			statusStyle = lipgloss.NewStyle()
		}

		urlText := result.URL
		if len(urlText) > 50 {
			urlText = urlText[:47] + "..."
		}

		line := fmt.Sprintf("%s %s (%d/%d fields, %s)",
			statusIcon,
			urlText,
			result.FilledFields,
			result.TotalFields,
			m.formatDuration(result.ExecutionTime))

		content.WriteString(statusStyle.Render(line))
		content.WriteString("\n")
	}

	return content.String()
}

// renderRecentResults renders recent execution results
func (m *ProgressViewModel) renderRecentResults() string {
	if len(m.session.Errors) == 0 {
		return ""
	}

	var content strings.Builder
	content.WriteString(progressSectionStyle.Render("Recent Errors:"))
	content.WriteString("\n")

	// Show last 3 errors
	start := 0
	if len(m.session.Errors) > 3 {
		start = len(m.session.Errors) - 3
	}

	for i := start; i < len(m.session.Errors); i++ {
		err := m.session.Errors[i]
		
		var severityIcon string
		switch err.Severity {
		case "critical":
			severityIcon = "🔥"
		case "high":
			severityIcon = "🚨"
		case "medium":
			severityIcon = "⚠️"
		default:
			severityIcon = "ℹ️"
		}

		line := fmt.Sprintf("%s %s: %s", severityIcon, err.URL, err.Message)
		content.WriteString(errorTextStyle.Render(line))
		content.WriteString("\n")
	}

	return content.String()
}

// updateProgress updates progress bars and calculations
func (m *ProgressViewModel) updateProgress() {
	if m.session == nil {
		return
	}

	// Update main progress
	progressPercent := m.session.Progress.Percentage / 100.0
	m.mainProgress.SetPercent(progressPercent)
}

// formatDuration formats a duration for display
func (m *ProgressViewModel) formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	} else if d < time.Hour {
		return fmt.Sprintf("%.1fm", d.Minutes())
	} else {
		return fmt.Sprintf("%.1fh", d.Hours())
	}
}

// progressTickMsg is sent periodically for animations
type progressTickMsg time.Time

// tickCmd returns a command that sends a progress tick message
func (m *ProgressViewModel) tickCmd() tea.Cmd {
	return tea.Tick(500*time.Millisecond, func(t time.Time) tea.Msg {
		return progressTickMsg(t)
	})
}

// Progress view styles
var (
	progressTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#7D56F4")).
		Padding(0, 1).
		Bold(true)

	progressStatsStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#04B575")).
		Bold(true)

	progressActivityStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFB86C")).
		Italic(true)

	progressSectionStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7D56F4")).
		Bold(true).
		Underline(true)

	progressHelpStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Italic(true)

	// Result status styles
	successTextStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#04B575"))

	errorTextStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF5F87"))

	warningTextStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFB86C"))

	skippedTextStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6272A4"))
)