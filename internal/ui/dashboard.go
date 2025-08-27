package ui

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/ai-form-filler/cli/internal/models"
)

// DashboardModel represents the execution dashboard
type DashboardModel struct {
	sessions       map[string]*models.ExecutionSession
	table          table.Model
	progressBars   map[string]progress.Model
	width          int
	height         int
	selectedIndex  int
	showDetails    bool
	refreshTicker  *time.Ticker
	lastUpdate     time.Time
}

// DashboardUpdateMsg is sent to update the dashboard
type DashboardUpdateMsg struct {
	Sessions []*models.ExecutionSession
}

// NewDashboardModel creates a new dashboard model
func NewDashboardModel() *DashboardModel {
	// Create table columns
	columns := []table.Column{
		{Title: "Profile", Width: 15},
		{Title: "Status", Width: 12},
		{Title: "Progress", Width: 20},
		{Title: "URLs", Width: 8},
		{Title: "Success Rate", Width: 12},
		{Title: "Duration", Width: 10},
		{Title: "Errors", Width: 8},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(10),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(false)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("229")).
		Background(lipgloss.Color("57")).
		Bold(false)
	t.SetStyles(s)

	return &DashboardModel{
		sessions:     make(map[string]*models.ExecutionSession),
		table:        t,
		progressBars: make(map[string]progress.Model),
		refreshTicker: time.NewTicker(1 * time.Second),
		lastUpdate:   time.Now(),
	}
}

// Init initializes the dashboard
func (m *DashboardModel) Init() tea.Cmd {
	return tea.Batch(
		m.tickCmd(),
	)
}

// Update handles messages
func (m *DashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.table.SetWidth(msg.Width - 4)
		m.table.SetHeight(msg.Height - 10)

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			if m.refreshTicker != nil {
				m.refreshTicker.Stop()
			}
			return m, tea.Quit

		case "r":
			// Refresh dashboard
			return m, m.refreshCmd()

		case "d":
			// Toggle details view
			m.showDetails = !m.showDetails
			return m, nil

		case "c":
			// Cancel selected session
			if len(m.table.Rows()) > 0 {
				selectedRow := m.table.SelectedRow()
				if len(selectedRow) > 0 {
					sessionID := selectedRow[0] // Assuming first hidden column is ID
					if session, exists := m.sessions[sessionID]; exists {
						session.Cancel()
					}
				}
			}
			return m, nil

		case "p":
			// Pause/Resume selected session
			if len(m.table.Rows()) > 0 {
				selectedRow := m.table.SelectedRow()
				if len(selectedRow) > 0 {
					sessionID := selectedRow[0]
					if session, exists := m.sessions[sessionID]; exists {
						if session.Status == models.StatusRunning {
							session.Pause()
						} else if session.Status == models.StatusPaused {
							session.Start()
						}
					}
				}
			}
			return m, nil
		}

		m.table, cmd = m.table.Update(msg)
		return m, cmd

	case DashboardUpdateMsg:
		m.updateSessions(msg.Sessions)
		return m, nil

	case tickMsg:
		// Auto-refresh every second
		return m, tea.Batch(
			m.tickCmd(),
			m.refreshCmd(),
		)
	}

	return m, cmd
}

// View renders the dashboard
func (m *DashboardModel) View() string {
	var content strings.Builder

	// Title
	content.WriteString(dashboardTitleStyle.Render("🚀 AI Form Filler - Execution Dashboard"))
	content.WriteString("\n\n")

	// Summary stats
	content.WriteString(m.renderSummary())
	content.WriteString("\n")

	// Main table
	content.WriteString(m.table.View())
	content.WriteString("\n")

	// Details view if enabled
	if m.showDetails {
		content.WriteString(m.renderDetails())
		content.WriteString("\n")
	}

	// Help text
	help := dashboardHelpStyle.Render(
		"• r: refresh • d: toggle details • c: cancel session • p: pause/resume • q: quit",
	)
	content.WriteString(help)

	// Last update time
	content.WriteString("\n")
	content.WriteString(dashboardFooterStyle.Render(
		fmt.Sprintf("Last updated: %s", m.lastUpdate.Format("15:04:05")),
	))

	return content.String()
}

// renderSummary renders the summary statistics
func (m *DashboardModel) renderSummary() string {
	var running, completed, failed, paused int
	var totalURLs, completedURLs, failedURLs int

	for _, session := range m.sessions {
		switch session.Status {
		case models.StatusRunning:
			running++
		case models.StatusCompleted:
			completed++
		case models.StatusFailed:
			failed++
		case models.StatusPaused:
			paused++
		}

		totalURLs += session.Progress.TotalURLs
		completedURLs += session.Progress.CompletedURLs
		failedURLs += session.Progress.FailedURLs
	}

	var overallProgress float64
	if totalURLs > 0 {
		overallProgress = float64(completedURLs+failedURLs) / float64(totalURLs) * 100
	}

	stats := []string{
		fmt.Sprintf("Running: %d", running),
		fmt.Sprintf("Completed: %d", completed),
		fmt.Sprintf("Failed: %d", failed),
		fmt.Sprintf("Paused: %d", paused),
		fmt.Sprintf("Overall Progress: %.1f%%", overallProgress),
	}

	return dashboardStatsStyle.Render(strings.Join(stats, " • "))
}

// renderDetails renders detailed information for the selected session
func (m *DashboardModel) renderDetails() string {
	if len(m.table.Rows()) == 0 {
		return ""
	}

	selectedRow := m.table.SelectedRow()
	if len(selectedRow) == 0 {
		return ""
	}

	// Find the session (this is simplified - in real implementation, 
	// we'd store session ID in a hidden column)
	profileName := selectedRow[0]
	var selectedSession *models.ExecutionSession
	for _, session := range m.sessions {
		if session.ProfileName == profileName {
			selectedSession = session
			break
		}
	}

	if selectedSession == nil {
		return ""
	}

	var details strings.Builder
	details.WriteString(dashboardDetailsTitleStyle.Render("Session Details"))
	details.WriteString("\n")

	// Session info
	details.WriteString(fmt.Sprintf("ID: %s\n", selectedSession.ID))
	details.WriteString(fmt.Sprintf("Profile: %s\n", selectedSession.ProfileName))
	details.WriteString(fmt.Sprintf("Status: %s\n", m.formatStatus(selectedSession.Status)))
	details.WriteString(fmt.Sprintf("Duration: %s\n", m.formatDuration(selectedSession.GetDuration())))
	details.WriteString(fmt.Sprintf("URLs: %d total, %d completed, %d failed\n",
		selectedSession.Progress.TotalURLs,
		selectedSession.Progress.CompletedURLs,
		selectedSession.Progress.FailedURLs))

	// Progress bar
	if progressBar, exists := m.progressBars[selectedSession.ID]; exists {
		details.WriteString("Progress: ")
		details.WriteString(progressBar.View())
		details.WriteString(fmt.Sprintf(" %.1f%%\n", selectedSession.Progress.Percentage))
	}

	// Recent errors
	if len(selectedSession.Errors) > 0 {
		details.WriteString("\nRecent Errors:\n")
		errorCount := len(selectedSession.Errors)
		start := 0
		if errorCount > 3 {
			start = errorCount - 3
		}
		for i := start; i < errorCount; i++ {
			err := selectedSession.Errors[i]
			details.WriteString(fmt.Sprintf("• %s: %s\n", err.URL, err.Message))
		}
	}

	return dashboardDetailsStyle.Render(details.String())
}

// updateSessions updates the sessions and refreshes the table
func (m *DashboardModel) updateSessions(sessions []*models.ExecutionSession) {
	// Update sessions map
	m.sessions = make(map[string]*models.ExecutionSession)
	for _, session := range sessions {
		m.sessions[session.ID] = session
		
		// Update or create progress bar
		if _, exists := m.progressBars[session.ID]; !exists {
			pb := progress.New(progress.WithDefaultGradient())
			m.progressBars[session.ID] = pb
		}
		pb := m.progressBars[session.ID]
		pb.SetPercent(session.Progress.Percentage / 100.0)
		m.progressBars[session.ID] = pb
	}

	// Update table rows
	m.updateTableRows()
	m.lastUpdate = time.Now()
}

// updateTableRows updates the table with current session data
func (m *DashboardModel) updateTableRows() {
	// Convert sessions to sorted slice
	sessionList := make([]*models.ExecutionSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessionList = append(sessionList, session)
	}

	// Sort by start time (newest first)
	sort.Slice(sessionList, func(i, j int) bool {
		return sessionList[i].StartTime.After(sessionList[j].StartTime)
	})

	// Create table rows
	rows := make([]table.Row, 0, len(sessionList))
	for _, session := range sessionList {
		progressBar := ""
		if pb, exists := m.progressBars[session.ID]; exists {
			progressBar = pb.View()
		}

		row := table.Row{
			session.ProfileName,
			m.formatStatus(session.Status),
			progressBar,
			fmt.Sprintf("%d/%d", session.Progress.CompletedURLs+session.Progress.FailedURLs, session.Progress.TotalURLs),
			fmt.Sprintf("%.1f%%", session.GetSuccessRate()),
			m.formatDuration(session.GetDuration()),
			fmt.Sprintf("%d", len(session.Errors)),
		}
		rows = append(rows, row)
	}

	m.table.SetRows(rows)
}

// formatStatus formats the execution status with colors
func (m *DashboardModel) formatStatus(status models.ExecutionStatus) string {
	switch status {
	case models.StatusRunning:
		return runningStyle.Render("Running")
	case models.StatusCompleted:
		return completedStyle.Render("Completed")
	case models.StatusFailed:
		return failedStyle.Render("Failed")
	case models.StatusPaused:
		return pausedStyle.Render("Paused")
	case models.StatusPending:
		return pendingStyle.Render("Pending")
	case models.StatusCancelled:
		return cancelledStyle.Render("Cancelled")
	default:
		return string(status)
	}
}

// formatDuration formats a duration for display
func (m *DashboardModel) formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%.0fs", d.Seconds())
	} else if d < time.Hour {
		return fmt.Sprintf("%.1fm", d.Minutes())
	} else {
		return fmt.Sprintf("%.1fh", d.Hours())
	}
}

// tickMsg is sent periodically to refresh the dashboard
type tickMsg time.Time

// tickCmd returns a command that sends a tick message
func (m *DashboardModel) tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

// refreshCmd returns a command to refresh the dashboard
func (m *DashboardModel) refreshCmd() tea.Cmd {
	return func() tea.Msg {
		// In a real implementation, this would fetch current sessions
		// For now, we'll just return the current sessions
		sessions := make([]*models.ExecutionSession, 0, len(m.sessions))
		for _, session := range m.sessions {
			sessions = append(sessions, session)
		}
		return DashboardUpdateMsg{Sessions: sessions}
	}
}

// Dashboard styles
var (
	dashboardTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#7D56F4")).
		Padding(0, 1).
		Bold(true)

	dashboardStatsStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#04B575")).
		Bold(true).
		Padding(0, 1)

	dashboardHelpStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Italic(true)

	dashboardFooterStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Italic(true)

	dashboardDetailsTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7D56F4")).
		Bold(true).
		Underline(true)

	dashboardDetailsStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(1).
		MarginTop(1)

	// Status styles
	runningStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#04B575")).
		Bold(true)

	completedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00D7FF")).
		Bold(true)

	failedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF5F87")).
		Bold(true)

	pausedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFB86C")).
		Bold(true)

	pendingStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Bold(true)

	cancelledStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6272A4")).
		Bold(true)
)