package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/ai-form-filler/cli/internal/models"
	"github.com/ai-form-filler/cli/internal/services"
)

// ProfileManagerModel represents the profile management interface
type ProfileManagerModel struct {
	profileService *services.ProfileService
	state          profileManagerState
	list           list.Model
	form           *ProfileFormModel
	width          int
	height         int
	err            error
}

type profileManagerState int

const (
	stateList profileManagerState = iota
	stateForm
	stateConfirmDelete
)

// ProfileItem represents a profile in the list
type ProfileItem struct {
	profile *models.ClientProfile
}

func (i ProfileItem) FilterValue() string { return i.profile.Name }
func (i ProfileItem) Title() string       { return i.profile.Name }
func (i ProfileItem) Description() string {
	return fmt.Sprintf("%s %s • %s", 
		i.profile.PersonalData.FirstName, 
		i.profile.PersonalData.LastName,
		i.profile.PersonalData.Email)
}

// NewProfileManagerModel creates a new profile manager
func NewProfileManagerModel(profileService *services.ProfileService) *ProfileManagerModel {
	// Create list
	items := []list.Item{}
	profiles, _ := profileService.GetProfiles()
	for _, p := range profiles {
		if profile, ok := p.(*models.ClientProfile); ok {
			items = append(items, ProfileItem{profile: profile})
		}
	}

	l := list.New(items, list.NewDefaultDelegate(), 0, 0)
	l.Title = "Client Profiles"
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(true)
	l.Styles.Title = titleStyle
	l.Styles.PaginationStyle = paginationStyle
	l.Styles.HelpStyle = helpStyle

	return &ProfileManagerModel{
		profileService: profileService,
		state:          stateList,
		list:           l,
	}
}

// Init initializes the profile manager
func (m *ProfileManagerModel) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m *ProfileManagerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.list.SetWidth(msg.Width)
		m.list.SetHeight(msg.Height - 4)
		if m.form != nil {
			m.form.SetSize(msg.Width, msg.Height)
		}

	case tea.KeyMsg:
		switch m.state {
		case stateList:
			return m.updateList(msg)
		case stateForm:
			return m.updateForm(msg)
		case stateConfirmDelete:
			return m.updateConfirmDelete(msg)
		}

	case ProfileFormCompleteMsg:
		// Profile form completed, refresh list and return to list view
		m.refreshList()
		m.state = stateList
		m.form = nil
		return m, nil

	case ProfileFormCancelMsg:
		// Profile form cancelled, return to list view
		m.state = stateList
		m.form = nil
		return m, nil
	}

	return m, cmd
}

// updateList handles list view updates
func (m *ProfileManagerModel) updateList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit

	case "n", "a":
		// Create new profile
		m.form = NewProfileFormModel(m.profileService, nil)
		m.form.SetSize(m.width, m.height)
		m.state = stateForm
		return m, m.form.Init()

	case "e", "enter":
		// Edit selected profile
		if item, ok := m.list.SelectedItem().(ProfileItem); ok {
			m.form = NewProfileFormModel(m.profileService, item.profile)
			m.form.SetSize(m.width, m.height)
			m.state = stateForm
			return m, m.form.Init()
		}

	case "d":
		// Delete selected profile
		if _, ok := m.list.SelectedItem().(ProfileItem); ok {
			m.state = stateConfirmDelete
			return m, nil
		}

	case "r":
		// Refresh list
		m.refreshList()
		return m, nil
	}

	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

// updateForm handles form view updates
func (m *ProfileManagerModel) updateForm(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.form == nil {
		m.state = stateList
		return m, nil
	}

	var cmd tea.Cmd
	formModel, cmd := m.form.Update(msg)
	m.form = formModel.(*ProfileFormModel)
	return m, cmd
}

// updateConfirmDelete handles delete confirmation
func (m *ProfileManagerModel) updateConfirmDelete(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "y", "Y":
		// Confirm delete
		if item, ok := m.list.SelectedItem().(ProfileItem); ok {
			if err := m.profileService.DeleteProfile(item.profile.ID); err != nil {
				m.err = err
			} else {
				m.refreshList()
			}
		}
		m.state = stateList
		return m, nil

	case "n", "N", "esc":
		// Cancel delete
		m.state = stateList
		return m, nil
	}

	return m, nil
}

// View renders the profile manager
func (m *ProfileManagerModel) View() string {
	switch m.state {
	case stateList:
		return m.viewList()
	case stateForm:
		return m.viewForm()
	case stateConfirmDelete:
		return m.viewConfirmDelete()
	}
	return ""
}

// viewList renders the list view
func (m *ProfileManagerModel) viewList() string {
	var content strings.Builder

	content.WriteString(m.list.View())
	content.WriteString("\n")

	// Help text
	help := helpTextStyle.Render(
		"• n/a: new profile • e/enter: edit • d: delete • r: refresh • q: quit",
	)
	content.WriteString(help)

	if m.err != nil {
		content.WriteString("\n")
		content.WriteString(errorStyle.Render(fmt.Sprintf("Error: %s", m.err)))
		m.err = nil
	}

	return content.String()
}

// viewForm renders the form view
func (m *ProfileManagerModel) viewForm() string {
	if m.form == nil {
		return "Loading form..."
	}
	return m.form.View()
}

// viewConfirmDelete renders the delete confirmation
func (m *ProfileManagerModel) viewConfirmDelete() string {
	if item, ok := m.list.SelectedItem().(ProfileItem); ok {
		return fmt.Sprintf(
			"%s\n\n%s\n\n%s",
			titleStyle.Render("Delete Profile"),
			fmt.Sprintf("Are you sure you want to delete profile '%s'?", item.profile.Name),
			helpTextStyle.Render("y: yes • n: no • esc: cancel"),
		)
	}
	return ""
}

// refreshList refreshes the profile list
func (m *ProfileManagerModel) refreshList() {
	profiles, _ := m.profileService.GetProfiles()
	items := make([]list.Item, 0, len(profiles))
	
	for _, p := range profiles {
		if profile, ok := p.(*models.ClientProfile); ok {
			items = append(items, ProfileItem{profile: profile})
		}
	}
	
	m.list.SetItems(items)
}

// Styles
var (
	titleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#7D56F4")).
		Padding(0, 1).
		Bold(true)

	paginationStyle = list.DefaultStyles().PaginationStyle.
		PaddingLeft(4)

	helpStyle = list.DefaultStyles().HelpStyle.
		PaddingLeft(4).
		PaddingBottom(1)

	helpTextStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Italic(true)

	errorStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF5F87")).
		Bold(true)
)