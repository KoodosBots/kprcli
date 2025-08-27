package models

import (
	"time"

	"github.com/google/uuid"
)

// ExecutionStatus represents the status of an execution session
type ExecutionStatus string

const (
	StatusPending    ExecutionStatus = "pending"
	StatusRunning    ExecutionStatus = "running"
	StatusCompleted  ExecutionStatus = "completed"
	StatusFailed     ExecutionStatus = "failed"
	StatusCancelled  ExecutionStatus = "cancelled"
	StatusPaused     ExecutionStatus = "paused"
)

// ExecutionSession represents a form filling execution session
type ExecutionSession struct {
	ID          string          `json:"id"`
	ProfileID   string          `json:"profileId"`
	ProfileName string          `json:"profileName"`
	URLs        []string        `json:"urls"`
	Status      ExecutionStatus `json:"status"`
	StartTime   time.Time       `json:"startTime"`
	EndTime     *time.Time      `json:"endTime,omitempty"`
	Progress    ExecutionProgress `json:"progress"`
	Results     []ExecutionResult `json:"results"`
	Errors      []ExecutionError  `json:"errors"`
	Config      ExecutionConfig   `json:"config"`
}

// ExecutionProgress tracks the progress of an execution session
type ExecutionProgress struct {
	TotalURLs     int     `json:"totalUrls"`
	CompletedURLs int     `json:"completedUrls"`
	FailedURLs    int     `json:"failedUrls"`
	SkippedURLs   int     `json:"skippedUrls"`
	Percentage    float64 `json:"percentage"`
	CurrentURL    string  `json:"currentUrl,omitempty"`
	EstimatedTime string  `json:"estimatedTime,omitempty"`
}

// ExecutionResult represents the result of filling a single form
type ExecutionResult struct {
	URL           string        `json:"url"`
	Status        string        `json:"status"` // success, failure, partial, skipped
	FilledFields  int           `json:"filledFields"`
	TotalFields   int           `json:"totalFields"`
	ExecutionTime time.Duration `json:"executionTime"`
	ErrorMessage  string        `json:"errorMessage,omitempty"`
	ScreenshotPath string       `json:"screenshotPath,omitempty"`
	Timestamp     time.Time     `json:"timestamp"`
}

// ExecutionError represents an error that occurred during execution
type ExecutionError struct {
	URL       string    `json:"url"`
	ErrorType string    `json:"errorType"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Severity  string    `json:"severity"` // low, medium, high, critical
}

// ExecutionConfig contains configuration for an execution session
type ExecutionConfig struct {
	MaxConcurrency    int           `json:"maxConcurrency"`
	Timeout          time.Duration `json:"timeout"`
	RetryAttempts    int           `json:"retryAttempts"`
	DelayBetweenURLs time.Duration `json:"delayBetweenUrls"`
	SkipCAPTCHA      bool          `json:"skipCaptcha"`
	TakeScreenshots  bool          `json:"takeScreenshots"`
	HeadlessMode     bool          `json:"headlessMode"`
}

// NewExecutionSession creates a new execution session
func NewExecutionSession(profileID, profileName string, urls []string, config ExecutionConfig) *ExecutionSession {
	return &ExecutionSession{
		ID:          uuid.New().String(),
		ProfileID:   profileID,
		ProfileName: profileName,
		URLs:        urls,
		Status:      StatusPending,
		StartTime:   time.Now(),
		Progress: ExecutionProgress{
			TotalURLs:  len(urls),
			Percentage: 0.0,
		},
		Results: make([]ExecutionResult, 0),
		Errors:  make([]ExecutionError, 0),
		Config:  config,
	}
}

// UpdateProgress updates the execution progress
func (e *ExecutionSession) UpdateProgress() {
	if e.Progress.TotalURLs == 0 {
		e.Progress.Percentage = 0.0
		return
	}
	
	completed := e.Progress.CompletedURLs + e.Progress.FailedURLs + e.Progress.SkippedURLs
	e.Progress.Percentage = float64(completed) / float64(e.Progress.TotalURLs) * 100.0
}

// AddResult adds an execution result
func (e *ExecutionSession) AddResult(result ExecutionResult) {
	e.Results = append(e.Results, result)
	
	switch result.Status {
	case "success", "partial":
		e.Progress.CompletedURLs++
	case "failure":
		e.Progress.FailedURLs++
	case "skipped":
		e.Progress.SkippedURLs++
	}
	
	e.UpdateProgress()
}

// AddError adds an execution error
func (e *ExecutionSession) AddError(err ExecutionError) {
	e.Errors = append(e.Errors, err)
}

// IsCompleted returns true if the execution is completed
func (e *ExecutionSession) IsCompleted() bool {
	return e.Status == StatusCompleted || e.Status == StatusFailed || e.Status == StatusCancelled
}

// GetDuration returns the execution duration
func (e *ExecutionSession) GetDuration() time.Duration {
	if e.EndTime != nil {
		return e.EndTime.Sub(e.StartTime)
	}
	return time.Since(e.StartTime)
}

// GetSuccessRate returns the success rate as a percentage
func (e *ExecutionSession) GetSuccessRate() float64 {
	if len(e.Results) == 0 {
		return 0.0
	}
	
	successful := 0
	for _, result := range e.Results {
		if result.Status == "success" {
			successful++
		}
	}
	
	return float64(successful) / float64(len(e.Results)) * 100.0
}

// Complete marks the execution as completed
func (e *ExecutionSession) Complete() {
	e.Status = StatusCompleted
	now := time.Now()
	e.EndTime = &now
}

// Fail marks the execution as failed
func (e *ExecutionSession) Fail() {
	e.Status = StatusFailed
	now := time.Now()
	e.EndTime = &now
}

// Cancel marks the execution as cancelled
func (e *ExecutionSession) Cancel() {
	e.Status = StatusCancelled
	now := time.Now()
	e.EndTime = &now
}

// Start marks the execution as running
func (e *ExecutionSession) Start() {
	e.Status = StatusRunning
}

// Pause marks the execution as paused
func (e *ExecutionSession) Pause() {
	e.Status = StatusPaused
}