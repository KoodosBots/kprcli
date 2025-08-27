package messaging

import (
	"encoding/json"
	"fmt"
	"time"
)

// HandshakeHandler handles initial connection handshake
type HandshakeHandler struct {
	version string
}

func NewHandshakeHandler(version string) *HandshakeHandler {
	return &HandshakeHandler{version: version}
}

func (h *HandshakeHandler) HandleMessage(msg *NativeMessage) (*NativeMessage, error) {
	var handshakeData struct {
		ExtensionID string `json:"extensionId"`
		Version     string `json:"version"`
	}

	if msg.Data != nil {
		data, _ := json.Marshal(msg.Data)
		json.Unmarshal(data, &handshakeData)
	}

	response := &NativeMessage{
		ID:   msg.ID,
		Type: "HANDSHAKE_RESPONSE",
		Data: map[string]interface{}{
			"cliVersion":    h.version,
			"status":        "connected",
			"capabilities":  []string{"form_filling", "training", "profile_management"},
			"timestamp":     time.Now().Unix(),
		},
		Success: true,
	}

	return response, nil
}

// ProfileHandler handles profile-related operations
type ProfileHandler struct {
	profileService ProfileService
}

type ProfileService interface {
	GetProfiles() ([]interface{}, error)
	CreateProfile(data map[string]interface{}) (interface{}, error)
	UpdateProfile(data map[string]interface{}) (interface{}, error)
	DeleteProfile(profileID string) error
	GetProfile(profileID string) (interface{}, error)
}

func NewProfileHandler(service ProfileService) *ProfileHandler {
	return &ProfileHandler{profileService: service}
}

func (h *ProfileHandler) HandleMessage(msg *NativeMessage) (*NativeMessage, error) {
	switch msg.Type {
	case "GET_PROFILES":
		profiles, err := h.profileService.GetProfiles()
		if err != nil {
			return nil, fmt.Errorf("failed to get profiles: %w", err)
		}
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "PROFILES_RESPONSE",
			Data:    profiles,
			Success: true,
		}, nil

	case "CREATE_PROFILE":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid profile data")
		}
		
		profile, err := h.profileService.CreateProfile(data)
		if err != nil {
			return nil, fmt.Errorf("failed to create profile: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "PROFILE_CREATED",
			Data:    profile,
			Success: true,
		}, nil

	case "UPDATE_PROFILE":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid profile data")
		}
		
		profile, err := h.profileService.UpdateProfile(data)
		if err != nil {
			return nil, fmt.Errorf("failed to update profile: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "PROFILE_UPDATED",
			Data:    profile,
			Success: true,
		}, nil

	case "DELETE_PROFILE":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid request data")
		}
		
		profileID, ok := data["profileId"].(string)
		if !ok {
			return nil, fmt.Errorf("missing profile ID")
		}
		
		err := h.profileService.DeleteProfile(profileID)
		if err != nil {
			return nil, fmt.Errorf("failed to delete profile: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "PROFILE_DELETED",
			Data:    map[string]string{"profileId": profileID},
			Success: true,
		}, nil

	default:
		return nil, fmt.Errorf("unknown profile operation: %s", msg.Type)
	}
}

// FormHandler handles form-related operations
type FormHandler struct {
	formService FormService
}

type FormService interface {
	FillForm(data map[string]interface{}) (interface{}, error)
	TrainForm(data map[string]interface{}) (interface{}, error)
	AnalyzeForms(data map[string]interface{}) (interface{}, error)
	ProcessTrainingData(data map[string]interface{}) error
}

func NewFormHandler(service FormService) *FormHandler {
	return &FormHandler{formService: service}
}

func (h *FormHandler) HandleMessage(msg *NativeMessage) (*NativeMessage, error) {
	data, ok := msg.Data.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid request data")
	}

	switch msg.Type {
	case "FILL_FORM":
		result, err := h.formService.FillForm(data)
		if err != nil {
			return nil, fmt.Errorf("form filling failed: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "FORM_FILL_RESPONSE",
			Data:    result,
			Success: true,
		}, nil

	case "TRAIN_FORM":
		result, err := h.formService.TrainForm(data)
		if err != nil {
			return nil, fmt.Errorf("form training failed: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "TRAINING_RESPONSE",
			Data:    result,
			Success: true,
		}, nil

	case "FORMS_DETECTED":
		result, err := h.formService.AnalyzeForms(data)
		if err != nil {
			return nil, fmt.Errorf("form analysis failed: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "FORMS_ANALYZED",
			Data:    result,
			Success: true,
		}, nil

	case "TRAINING_DATA":
		err := h.formService.ProcessTrainingData(data)
		if err != nil {
			return nil, fmt.Errorf("training data processing failed: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "TRAINING_DATA_PROCESSED",
			Success: true,
		}, nil

	default:
		return nil, fmt.Errorf("unknown form operation: %s", msg.Type)
	}
}

// StatusHandler handles status and control operations
type StatusHandler struct {
	statusService StatusService
}

type StatusService interface {
	GetStatus() (interface{}, error)
	OpenDashboard() error
}

func NewStatusHandler(service StatusService) *StatusHandler {
	return &StatusHandler{statusService: service}
}

func (h *StatusHandler) HandleMessage(msg *NativeMessage) (*NativeMessage, error) {
	switch msg.Type {
	case "GET_STATUS":
		status, err := h.statusService.GetStatus()
		if err != nil {
			return nil, fmt.Errorf("failed to get status: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "STATUS_RESPONSE",
			Data:    status,
			Success: true,
		}, nil

	case "OPEN_CLI_DASHBOARD":
		err := h.statusService.OpenDashboard()
		if err != nil {
			return nil, fmt.Errorf("failed to open dashboard: %w", err)
		}
		
		return &NativeMessage{
			ID:      msg.ID,
			Type:    "DASHBOARD_OPENED",
			Success: true,
		}, nil

	default:
		return nil, fmt.Errorf("unknown status operation: %s", msg.Type)
	}
}