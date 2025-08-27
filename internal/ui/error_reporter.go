package ui

import (
	"fmt"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/ai-form-filler/cli/internal/models"
)

// ErrorReporterModel represents the error reporting interface
type ErrorReporterModel struct {
	errors        []models.ExecutionError
	table         table.Model
	selectedError *models.ExecutionError
	showDetails   bool
	width         int
	height        int
	filterLevel   string // all, critical, high, medium, low
}

// ErrorUpdateMsg updates the error list
type ErrorUpdateMsg struct {
	Errors []models.ExecutionError
}

// NewErrorReporterModel creates a new error reporter
func NewErrorReporterModel() *ErrorReporterModel {
	// Create table columns
	columns := []table.Column{
		{Title: "Time", Width: 12},
		{Title: "Severity", Width: 10},
		{Title: "Type", Width: 15},
		{Title: "URL", Width: 30},
		{Title: "Message", Width: 40},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(15),
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

	return &ErrorReporterModel{
		errors:      make([]models.ExecutionError, 0),
		table:       t,
		filterLevel: "all",
	}
}

// Init initializes the error reporter
func (m *ErrorReporterModel) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m *ErrorReporterModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.table.SetWidth(msg.Width - 4)
		m.table.SetHeight(msg.Height - 12)

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit

		case "d":
			// Toggle details view
			m.showDetails = !m.showDetails
			m.updateSelectedError()
			return m, nil

		case "f":
			// Cycle through filter levels
			m.cycleFilter()
			m.updateTable()
			return m, nil

		case "r":
			// Refresh errors
			return m, m.refreshCmd()

		case "c":
			// Clear all errors
			m.errors = make([]models.ExecutionError, 0)
			m.updateTable()
			return m, nil

		case "enter":
			// Show error details
			m.showDetails = true
			m.updateSelectedError()
			return m, nil
		}

		m.table, cmd = m.table.Update(msg)
		m.updateSelectedError()
		return m, cmd

	case ErrorUpdateMsg:
		m.errors = msg.Errors
		m.updateTable()
		return m, nil
	}

	return m, cmd
}

// View renders the error reporter
func (m *ErrorReporterModel) View() string {
	var content strings.Builder

	// Title with filter info
	title := fmt.Sprintf("🚨 Error Reporter - Filter: %s (%d errors)", 
		strings.Title(m.filterLevel), len(m.getFilteredErrors()))
	content.WriteString(errorTitleStyle.Render(title))
	content.WriteString("\n\n")

	// Summary statistics
	content.WriteString(m.renderSummary())
	content.WriteString("\n")

	// Error table
	content.WriteString(m.table.View())
	content.WriteString("\n")

	// Error details if enabled
	if m.showDetails && m.selectedError != nil {
		content.WriteString(m.renderErrorDetails())
		content.WriteString("\n")
	}

	// Help text
	help := errorHelpStyle.Render(
		"• d: toggle details • f: filter • r: refresh • c: clear • enter: show details • q: quit",
	)
	content.WriteString(help)

	return content.String()
}

// renderSummary renders error summary statistics
func (m *ErrorReporterModel) renderSummary() string {
	var critical, high, medium, low int

	for _, err := range m.errors {
		switch err.Severity {
		case "critical":
			critical++
		case "high":
			high++
		case "medium":
			medium++
		case "low":
			low++
		}
	}

	stats := []string{
		fmt.Sprintf("Critical: %d", critical),
		fmt.Sprintf("High: %d", high),
		fmt.Sprintf("Medium: %d", medium),
		fmt.Sprintf("Low: %d", low),
		fmt.Sprintf("Total: %d", len(m.errors)),
	}

	return errorSummaryStyle.Render("📊 " + strings.Join(stats, " • "))
}

// renderErrorDetails renders detailed information for the selected error
func (m *ErrorReporterModel) renderErrorDetails() string {
	if m.selectedError == nil {
		return ""
	}

	var details strings.Builder
	details.WriteString(errorDetailsTitleStyle.Render("Error Details"))
	details.WriteString("\n")

	// Error information
	details.WriteString(fmt.Sprintf("Timestamp: %s\n", 
		m.selectedError.Timestamp.Format("2006-01-02 15:04:05")))
	details.WriteString(fmt.Sprintf("Severity: %s\n", 
		m.formatSeverity(m.selectedError.Severity)))
	details.WriteString(fmt.Sprintf("Type: %s\n", m.selectedError.ErrorType))
	details.WriteString(fmt.Sprintf("URL: %s\n", m.selectedError.URL))
	details.WriteString(fmt.Sprintf("Message: %s\n", m.selectedError.Message))

	// Recovery suggestions
	details.WriteString("\nRecovery Suggestions:\n")
	suggestions := m.getRecoverySuggestions(m.selectedError)
	for _, suggestion := range suggestions {
		details.WriteString(fmt.Sprintf("• %s\n", suggestion))
	}

	return errorDetailsStyle.Render(details.String())
}

// getRecoverySuggestions returns recovery suggestions for an error
func (m *ErrorReporterModel) getRecoverySuggestions(err *models.ExecutionError) []string {
	suggestions := make([]string, 0)

	switch err.ErrorType {
	case "network_error":
		suggestions = append(suggestions, 
			"Check internet connection",
			"Verify the URL is accessible",
			"Try again after a few minutes",
			"Check if the website is down")

	case "form_not_found":
		suggestions = append(suggestions,
			"Verify the URL contains a form",
			"Check if the website structure has changed",
			"Retrain the AI on this website",
			"Update form selectors manually")

	case "field_not_found":
		suggestions = append(suggestions,
			"Check if form fields have changed",
			"Update field selectors",
			"Retrain the form template",
			"Verify field names and IDs")

	case "validation_failed":
		suggestions = append(suggestions,
			"Check profile data format",
			"Verify required fields are filled",
			"Update validation rules",
			"Check field constraints")

	case "captcha_failed":
		suggestions = append(suggestions,
			"Check CAPTCHA solver configuration",
			"Verify API keys are valid",
			"Try alternative CAPTCHA solvers",
			"Enable manual CAPTCHA handling")

	case "timeout_error":
		suggestions = append(suggestions,
			"Increase timeout duration",
			"Check website response time",
			"Reduce concurrent executions",
			"Verify system resources")

	case "rate_limit_exceeded":
		suggestions = append(suggestions,
			"Reduce execution frequency",
			"Add delays between requests",
			"Use different IP addresses",
			"Contact website administrator")

	default:
		suggestions = append(suggestions,
			"Check error logs for more details",
			"Retry the operation",
			"Contact support if issue persists",
			"Update the application")
	}

	return suggestions
}

// updateTable updates the error table with filtered data
func (m *ErrorReporterModel) updateTable() {
	filteredErrors := m.getFilteredErrors()
	
	// Sort errors by timestamp (newest first)
	sort.Slice(filteredErrors, func(i, j int) bool {
		return filteredErrors[i].Timestamp.After(filteredErrors[j].Timestamp)
	})

	// Create table rows
	rows := make([]table.Row, 0, len(filteredErrors))
	for _, err := range filteredErrors {
		url := err.URL
		if len(url) > 30 {
			url = url[:27] + "..."
		}

		message := err.Message
		if len(message) > 40 {
			message = message[:37] + "..."
		}

		row := table.Row{
			err.Timestamp.Format("15:04:05"),
			m.formatSeverity(err.Severity),
			err.ErrorType,
			url,
			message,
		}
		rows = append(rows, row)
	}

	m.table.SetRows(rows)
}

// getFilteredErrors returns errors filtered by current filter level
func (m *ErrorReporterModel) getFilteredErrors() []models.ExecutionError {
	if m.filterLevel == "all" {
		return m.errors
	}

	filtered := make([]models.ExecutionError, 0)
	for _, err := range m.errors {
		if err.Severity == m.filterLevel {
			filtered = append(filtered, err)
		}
	}
	return filtered
}

// cycleFilter cycles through filter levels
func (m *ErrorReporterModel) cycleFilter() {
	filters := []string{"all", "critical", "high", "medium", "low"}
	
	for i, filter := range filters {
		if filter == m.filterLevel {
			m.filterLevel = filters[(i+1)%len(filters)]
			break
		}
	}
}

// updateSelectedError updates the selected error based on table selection
func (m *ErrorReporterModel) updateSelectedError() {
	if len(m.table.Rows()) == 0 {
		m.selectedError = nil
		return
	}

	selectedRow := m.table.SelectedRow()
	if len(selectedRow) == 0 {
		m.selectedError = nil
		return
	}

	// Find the error by timestamp and URL (simplified matching)
	timeStr := selectedRow[0]
	url := selectedRow[3]
	
	filteredErrors := m.getFilteredErrors()
	for _, err := range filteredErrors {
		if err.Timestamp.Format("15:04:05") == timeStr && 
		   (err.URL == url || strings.HasPrefix(err.URL, url[:len(url)-3])) {
			m.selectedError = &err
			break
		}
	}
}

// formatSeverity formats severity with colors
func (m *ErrorReporterModel) formatSeverity(severity string) string {
	switch severity {
	case "critical":
		return criticalStyle.Render("Critical")
	case "high":
		return highStyle.Render("High")
	case "medium":
		return mediumStyle.Render("Medium")
	case "low":
		return lowStyle.Render("Low")
	default:
		return severity
	}
}

// refreshCmd returns a command to refresh errors
func (m *ErrorReporterModel) refreshCmd() tea.Cmd {
	return func() tea.Msg {
		// In a real implementation, this would fetch current errors
		return ErrorUpdateMsg{Errors: m.errors}
	}
}

// Error reporter styles
var (
	errorTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#FF5F87")).
		Padding(0, 1).
		Bold(true)

	errorSummaryStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFB86C")).
		Bold(true)

	errorHelpStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Italic(true)

	errorDetailsTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF5F87")).
		Bold(true).
		Underline(true)

	errorDetailsStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(1).
		MarginTop(1)

	// Severity styles
	criticalStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF0000")).
		Bold(true)

	highStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF5F87")).
		Bold(true)

	mediumStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFB86C")).
		Bold(true)

	lowStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6272A4")).
		Bold(true)
)