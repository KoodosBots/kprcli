package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/ai-form-filler/cli/internal/models"
	"github.com/ai-form-filler/cli/internal/services"
)

// ProfileFormModel represents the profile creation/editing form
type ProfileFormModel struct {
	profileService *services.ProfileService
	profile        *models.ClientProfile
	isEditing      bool
	inputs         []textinput.Model
	focused        int
	width          int
	height         int
	err            error
}

// Form field indices
const (
	fieldName = iota
	fieldFirstName
	fieldLastName
	fieldEmail
	fieldPhone
	fieldStreet1
	fieldStreet2
	fieldCity
	fieldState
	fieldPostalCode
	fieldCountry
	fieldDateOfBirth
	fieldCount
)

// ProfileFormCompleteMsg is sent when the form is completed
type ProfileFormCompleteMsg struct{}

// ProfileFormCancelMsg is sent when the form is cancelled
type ProfileFormCancelMsg struct{}

// NewProfileFormModel creates a new profile form
func NewProfileFormModel(profileService *services.ProfileService, profile *models.ClientProfile) *ProfileFormModel {
	inputs := make([]textinput.Model, fieldCount)
	
	// Initialize all text inputs
	for i := range inputs {
		inputs[i] = textinput.New()
		inputs[i].CharLimit = 100
	}

	// Configure specific fields
	inputs[fieldName].Placeholder = "Profile Name"
	inputs[fieldName].Focus()
	inputs[fieldName].PromptStyle = focusedStyle
	inputs[fieldName].TextStyle = focusedStyle

	inputs[fieldFirstName].Placeholder = "First Name"
	inputs[fieldLastName].Placeholder = "Last Name"
	inputs[fieldEmail].Placeholder = "Email Address"
	inputs[fieldPhone].Placeholder = "Phone Number"
	inputs[fieldStreet1].Placeholder = "Street Address"
	inputs[fieldStreet2].Placeholder = "Street Address 2 (Optional)"
	inputs[fieldCity].Placeholder = "City"
	inputs[fieldState].Placeholder = "State/Province"
	inputs[fieldPostalCode].Placeholder = "Postal Code"
	inputs[fieldCountry].Placeholder = "Country"
	inputs[fieldDateOfBirth].Placeholder = "Date of Birth (YYYY-MM-DD)"

	model := &ProfileFormModel{
		profileService: profileService,
		profile:        profile,
		isEditing:      profile != nil,
		inputs:         inputs,
		focused:        0,
	}

	// If editing, populate fields
	if profile != nil {
		model.populateFields()
	}

	return model
}

// Init initializes the form
func (m *ProfileFormModel) Init() tea.Cmd {
	return textinput.Blink
}

// Update handles messages
func (m *ProfileFormModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "esc":
			return m, m.SendCancelCmd()

		case "tab", "shift+tab", "enter", "up", "down":
			s := msg.String()

			// Cycle through inputs
			if s == "up" || s == "shift+tab" {
				m.focused--
				if m.focused < 0 {
					m.focused = len(m.inputs) - 1
				}
			} else if s == "down" || s == "tab" {
				m.focused++
				if m.focused >= len(m.inputs) {
					m.focused = 0
				}
			} else if s == "enter" {
				// Submit form
				return m.submitForm()
			}

			m.updateFocus()

		case "ctrl+s":
			// Save with Ctrl+S
			return m.submitForm()

		default:
			// Handle character input
			var cmd tea.Cmd
			m.inputs[m.focused], cmd = m.inputs[m.focused].Update(msg)
			return m, cmd
		}
	}

	return m, nil
}

// View renders the form
func (m *ProfileFormModel) View() string {
	var b strings.Builder

	// Title
	title := "Create New Profile"
	if m.isEditing {
		title = "Edit Profile"
	}
	b.WriteString(titleStyle.Render(title))
	b.WriteString("\n\n")

	// Form sections
	b.WriteString(m.renderSection("Profile Information", []int{fieldName}))
	b.WriteString(m.renderSection("Personal Information", []int{
		fieldFirstName, fieldLastName, fieldEmail, fieldPhone, fieldDateOfBirth,
	}))
	b.WriteString(m.renderSection("Address Information", []int{
		fieldStreet1, fieldStreet2, fieldCity, fieldState, fieldPostalCode, fieldCountry,
	}))

	// Help text
	b.WriteString("\n")
	b.WriteString(helpTextStyle.Render("• tab/shift+tab: navigate • enter/ctrl+s: save • esc: cancel"))

	// Error message
	if m.err != nil {
		b.WriteString("\n\n")
		b.WriteString(errorStyle.Render(fmt.Sprintf("Error: %s", m.err)))
	}

	return b.String()
}

// renderSection renders a form section
func (m *ProfileFormModel) renderSection(title string, fields []int) string {
	var b strings.Builder

	b.WriteString(sectionTitleStyle.Render(title))
	b.WriteString("\n")

	for _, fieldIdx := range fields {
		label := m.getFieldLabel(fieldIdx)
		input := m.inputs[fieldIdx].View()
		
		if fieldIdx == m.focused {
			b.WriteString(focusedLabelStyle.Render(label))
		} else {
			b.WriteString(labelStyle.Render(label))
		}
		b.WriteString("\n")
		b.WriteString(input)
		b.WriteString("\n")
	}

	b.WriteString("\n")
	return b.String()
}

// getFieldLabel returns the label for a field
func (m *ProfileFormModel) getFieldLabel(fieldIdx int) string {
	labels := []string{
		"Profile Name:",
		"First Name:",
		"Last Name:",
		"Email:",
		"Phone:",
		"Street Address:",
		"Street Address 2:",
		"City:",
		"State/Province:",
		"Postal Code:",
		"Country:",
		"Date of Birth:",
	}
	
	if fieldIdx < len(labels) {
		return labels[fieldIdx]
	}
	return "Field:"
}

// updateFocus updates the focus state of inputs
func (m *ProfileFormModel) updateFocus() {
	for i := range m.inputs {
		if i == m.focused {
			m.inputs[i].Focus()
			m.inputs[i].PromptStyle = focusedStyle
			m.inputs[i].TextStyle = focusedStyle
		} else {
			m.inputs[i].Blur()
			m.inputs[i].PromptStyle = noStyle
			m.inputs[i].TextStyle = noStyle
		}
	}
}

// populateFields populates form fields with existing profile data
func (m *ProfileFormModel) populateFields() {
	if m.profile == nil {
		return
	}

	m.inputs[fieldName].SetValue(m.profile.Name)
	m.inputs[fieldFirstName].SetValue(m.profile.PersonalData.FirstName)
	m.inputs[fieldLastName].SetValue(m.profile.PersonalData.LastName)
	m.inputs[fieldEmail].SetValue(m.profile.PersonalData.Email)
	m.inputs[fieldPhone].SetValue(m.profile.PersonalData.Phone)
	m.inputs[fieldStreet1].SetValue(m.profile.PersonalData.Address.Street1)
	m.inputs[fieldStreet2].SetValue(m.profile.PersonalData.Address.Street2)
	m.inputs[fieldCity].SetValue(m.profile.PersonalData.Address.City)
	m.inputs[fieldState].SetValue(m.profile.PersonalData.Address.State)
	m.inputs[fieldPostalCode].SetValue(m.profile.PersonalData.Address.PostalCode)
	m.inputs[fieldCountry].SetValue(m.profile.PersonalData.Address.Country)
	m.inputs[fieldDateOfBirth].SetValue(m.profile.PersonalData.DateOfBirth)
}

// submitForm submits the form
func (m *ProfileFormModel) submitForm() (tea.Model, tea.Cmd) {
	// Validate required fields
	if strings.TrimSpace(m.inputs[fieldName].Value()) == "" {
		m.err = fmt.Errorf("profile name is required")
		return m, nil
	}
	if strings.TrimSpace(m.inputs[fieldFirstName].Value()) == "" {
		m.err = fmt.Errorf("first name is required")
		return m, nil
	}
	if strings.TrimSpace(m.inputs[fieldLastName].Value()) == "" {
		m.err = fmt.Errorf("last name is required")
		return m, nil
	}
	if strings.TrimSpace(m.inputs[fieldEmail].Value()) == "" {
		m.err = fmt.Errorf("email is required")
		return m, nil
	}

	// Create profile data
	data := map[string]interface{}{
		"name": strings.TrimSpace(m.inputs[fieldName].Value()),
		"personalData": map[string]interface{}{
			"firstName":   strings.TrimSpace(m.inputs[fieldFirstName].Value()),
			"lastName":    strings.TrimSpace(m.inputs[fieldLastName].Value()),
			"email":       strings.TrimSpace(m.inputs[fieldEmail].Value()),
			"phone":       strings.TrimSpace(m.inputs[fieldPhone].Value()),
			"dateOfBirth": strings.TrimSpace(m.inputs[fieldDateOfBirth].Value()),
			"address": map[string]interface{}{
				"street1":    strings.TrimSpace(m.inputs[fieldStreet1].Value()),
				"street2":    strings.TrimSpace(m.inputs[fieldStreet2].Value()),
				"city":       strings.TrimSpace(m.inputs[fieldCity].Value()),
				"state":      strings.TrimSpace(m.inputs[fieldState].Value()),
				"postalCode": strings.TrimSpace(m.inputs[fieldPostalCode].Value()),
				"country":    strings.TrimSpace(m.inputs[fieldCountry].Value()),
			},
		},
	}

	// Save profile
	var err error
	if m.isEditing {
		data["id"] = m.profile.ID
		_, err = m.profileService.UpdateProfile(data)
	} else {
		_, err = m.profileService.CreateProfile(data)
	}

	if err != nil {
		m.err = err
		return m, nil
	}

	return m, m.SendCompleteCmd()
}

// sendComplete sends completion message
func (m *ProfileFormModel) sendComplete() tea.Model {
	return m
}

// sendCancel sends cancel message
func (m *ProfileFormModel) sendCancel() tea.Model {
	return m
}

// SendCompleteCmd returns a command that sends ProfileFormCompleteMsg
func (m *ProfileFormModel) SendCompleteCmd() tea.Cmd {
	return func() tea.Msg {
		return ProfileFormCompleteMsg{}
	}
}

// SendCancelCmd returns a command that sends ProfileFormCancelMsg
func (m *ProfileFormModel) SendCancelCmd() tea.Cmd {
	return func() tea.Msg {
		return ProfileFormCancelMsg{}
	}
}

// SetSize sets the form size
func (m *ProfileFormModel) SetSize(width, height int) {
	m.width = width
	m.height = height
}

// Form styles
var (
	focusedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	blurredStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	noStyle      = lipgloss.NewStyle()

	sectionTitleStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7D56F4")).
		Bold(true).
		Underline(true).
		MarginTop(1)

	labelStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FAFAFA")).
		MarginLeft(2)

	focusedLabelStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7D56F4")).
		Bold(true).
		MarginLeft(2)
)