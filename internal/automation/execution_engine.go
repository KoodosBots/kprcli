package automation

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/ai-form-filler/cli/internal/models"
)

// ExecutionEngine manages parallel form filling operations with resource monitoring
type ExecutionEngine struct {
	browserManager   *BrowserManager
	formFiller      *FormFiller
	resourceMonitor *ResourceMonitor
	config          *ExecutionConfig
	activeJobs      map[string]*ExecutionJob
	jobsMutex       sync.RWMutex
	ctx             context.Context
	cancel          context.CancelFunc
}

// ExecutionConfig holds configuration for the execution engine
type ExecutionConfig struct {
	MaxConcurrency      int           `json:"maxConcurrency"`
	AutoAdjustLimits    bool          `json:"autoAdjustLimits"`
	ResourceThresholds  ResourceThresholds `json:"resourceThresholds"`
	DefaultTimeout      time.Duration `json:"defaultTimeout"`
	RetryAttempts       int           `json:"retryAttempts"`
	DelayBetweenJobs    time.Duration `json:"delayBetweenJobs"`
	MonitoringInterval  time.Duration `json:"monitoringInterval"`
	EnableScreenshots   bool          `json:"enableScreenshots"`
	EnableErrorRecovery bool          `json:"enableErrorRecovery"`
}

// ResourceThresholds defines system resource limits
type ResourceThresholds struct {
	MaxCPUPercent    float64 `json:"maxCpuPercent"`
	MaxMemoryPercent float64 `json:"maxMemoryPercent"`
	MinFreeMB        int64   `json:"minFreeMb"`
	MaxBrowsers      int     `json:"maxBrowsers"`
}

// ExecutionJob represents a single form filling job
type ExecutionJob struct {
	ID          string                    `json:"id"`
	Session     *models.ExecutionSession  `json:"session"`
	Status      models.ExecutionStatus    `json:"status"`
	StartTime   time.Time                 `json:"startTime"`
	EndTime     *time.Time                `json:"endTime,omitempty"`
	Progress    float64                   `json:"progress"`
	CurrentURL  string                    `json:"currentUrl,omitempty"`
	Results     []models.ExecutionResult  `json:"results"`
	Errors      []models.ExecutionError   `json:"errors"`
	Context     context.Context           `json:"-"`
	Cancel      context.CancelFunc        `json:"-"`
}

// DefaultExecutionConfig returns sensible defaults
func DefaultExecutionConfig() *ExecutionConfig {
	return &ExecutionConfig{
		MaxConcurrency:     detectOptimalConcurrency(),
		AutoAdjustLimits:   true,
		ResourceThresholds: ResourceThresholds{
			MaxCPUPercent:    80.0,
			MaxMemoryPercent: 75.0,
			MinFreeMB:        512,
			MaxBrowsers:      20,
		},
		DefaultTimeout:      30 * time.Second,
		RetryAttempts:       3,
		DelayBetweenJobs:    1 * time.Second,
		MonitoringInterval:  5 * time.Second,
		EnableScreenshots:   true,
		EnableErrorRecovery: true,
	}
}

// NewExecutionEngine creates a new execution engine
func NewExecutionEngine(browserManager *BrowserManager, config *ExecutionConfig) (*ExecutionEngine, error) {
	if config == nil {
		config = DefaultExecutionConfig()
	}

	formFiller := NewFormFiller(browserManager, DefaultFormFillerConfig())
	resourceMonitor := NewResourceMonitor()

	ctx, cancel := context.WithCancel(context.Background())

	engine := &ExecutionEngine{
		browserManager:  browserManager,
		formFiller:     formFiller,
		resourceMonitor: resourceMonitor,
		config:         config,
		activeJobs:     make(map[string]*ExecutionJob),
		ctx:            ctx,
		cancel:         cancel,
	}

	// Start resource monitoring if auto-adjust is enabled
	if config.AutoAdjustLimits {
		go engine.monitorResources()
	}

	return engine, nil
}

// ExecuteSession executes a complete execution session with parallel processing
func (ee *ExecutionEngine) ExecuteSession(session *models.ExecutionSession, profileData *ProfileData, templates map[string]*FormTemplate) error {
	// Create execution job
	job := &ExecutionJob{
		ID:        session.ID,
		Session:   session,
		Status:    models.StatusRunning,
		StartTime: time.Now(),
		Results:   make([]models.ExecutionResult, 0),
		Errors:    make([]models.ExecutionError, 0),
	}
	job.Context, job.Cancel = context.WithCancel(ee.ctx)

	// Register job
	ee.jobsMutex.Lock()
	ee.activeJobs[job.ID] = job
	ee.jobsMutex.Unlock()

	// Ensure cleanup
	defer func() {
		ee.jobsMutex.Lock()
		delete(ee.activeJobs, job.ID)
		ee.jobsMutex.Unlock()
		job.Cancel()
	}()

	// Start session
	session.Start()

	// Create URL processing tasks
	urlTasks := make([]URLTask, 0, len(session.URLs))
	for _, url := range session.URLs {
		template, exists := templates[url]
		if !exists {
			// Create a basic template if none exists
			template = &FormTemplate{
				ID:     fmt.Sprintf("auto_%s", url),
				URL:    url,
				Fields: []FormField{}, // Will be detected dynamically
			}
		}

		urlTasks = append(urlTasks, URLTask{
			URL:         url,
			Template:    template,
			ProfileData: profileData,
			JobID:       job.ID,
		})
	}

	// Execute tasks in parallel with concurrency control
	results := ee.executeURLTasksParallel(job.Context, urlTasks)

	// Process results
	for i, result := range results {
		if result.Error != nil {
			// Add error to job
			execError := models.ExecutionError{
				URL:       urlTasks[i].URL,
				ErrorType: "execution_error",
				Message:   result.Error.Error(),
				Timestamp: time.Now(),
				Severity:  "high",
			}
			job.Errors = append(job.Errors, execError)
			session.AddError(execError)
		} else {
			// Add successful result
			execResult := models.ExecutionResult{
				URL:           urlTasks[i].URL,
				Status:        "success",
				FilledFields:  result.FillResult.FilledFields,
				TotalFields:   result.FillResult.TotalFields,
				ExecutionTime: result.FillResult.ExecutionTime,
				Timestamp:     result.FillResult.Timestamp,
			}
			job.Results = append(job.Results, execResult)
			session.AddResult(execResult)
		}
	}

	// Complete session
	now := time.Now()
	job.EndTime = &now
	if len(job.Errors) == 0 {
		job.Status = models.StatusCompleted
		session.Complete()
	} else {
		job.Status = models.StatusFailed
		session.Fail()
	}

	return nil
}

// URLTask represents a single URL processing task
type URLTask struct {
	URL         string
	Template    *FormTemplate
	ProfileData *ProfileData
	JobID       string
}

// URLTaskResult represents the result of processing a URL task
type URLTaskResult struct {
	URL        string
	FillResult *FillResult
	Error      error
}

// executeURLTasksParallel executes URL tasks in parallel with resource monitoring
func (ee *ExecutionEngine) executeURLTasksParallel(ctx context.Context, tasks []URLTask) []URLTaskResult {
	results := make([]URLTaskResult, len(tasks))
	semaphore := make(chan struct{}, ee.getCurrentConcurrencyLimit())
	var wg sync.WaitGroup

	for i, task := range tasks {
		wg.Add(1)
		go func(index int, urlTask URLTask) {
			defer wg.Done()

			// Acquire semaphore
			select {
			case semaphore <- struct{}{}:
				defer func() { <-semaphore }()
			case <-ctx.Done():
				results[index] = URLTaskResult{
					URL:   urlTask.URL,
					Error: ctx.Err(),
				}
				return
			}

			// Check if we should pause due to resource constraints
			if ee.shouldPauseExecution() {
				time.Sleep(ee.config.DelayBetweenJobs * 2)
			}

			// Execute the task
			fillResult, err := ee.executeURLTask(ctx, urlTask)
			results[index] = URLTaskResult{
				URL:        urlTask.URL,
				FillResult: fillResult,
				Error:      err,
			}

			// Add delay between tasks
			time.Sleep(ee.config.DelayBetweenJobs)
		}(i, task)
	}

	wg.Wait()
	return results
}

// executeURLTask executes a single URL task
func (ee *ExecutionEngine) executeURLTask(ctx context.Context, task URLTask) (*FillResult, error) {
	// Update job progress
	ee.updateJobProgress(task.JobID, task.URL)

	// Execute with retry logic
	var lastErr error
	for attempt := 0; attempt <= ee.config.RetryAttempts; attempt++ {
		if attempt > 0 {
			// Wait before retry
			time.Sleep(time.Duration(attempt) * time.Second)
		}

		result, err := ee.formFiller.FillForm(ctx, task.Template, task.ProfileData)
		if err == nil {
			return result, nil
		}

		lastErr = err

		// Check if we should retry based on error type
		if !ee.shouldRetryError(err) {
			break
		}
	}

	return nil, lastErr
}

// updateJobProgress updates the progress of a specific job
func (ee *ExecutionEngine) updateJobProgress(jobID, currentURL string) {
	ee.jobsMutex.Lock()
	defer ee.jobsMutex.Unlock()

	if job, exists := ee.activeJobs[jobID]; exists {
		job.CurrentURL = currentURL
		// Update session progress
		if job.Session != nil {
			job.Session.Progress.CurrentURL = currentURL
		}
	}
}

// getCurrentConcurrencyLimit returns the current concurrency limit
func (ee *ExecutionEngine) getCurrentConcurrencyLimit() int {
	if !ee.config.AutoAdjustLimits {
		return ee.config.MaxConcurrency
	}

	resources := ee.resourceMonitor.GetCurrentResources()
	
	// Adjust based on resource usage
	if resources.CPUUsage > ee.config.ResourceThresholds.MaxCPUPercent ||
	   resources.MemoryUsage > ee.config.ResourceThresholds.MaxMemoryPercent {
		// Reduce concurrency
		return max(1, ee.config.MaxConcurrency/2)
	}

	return ee.config.MaxConcurrency
}

// shouldPauseExecution checks if execution should be paused due to resource constraints
func (ee *ExecutionEngine) shouldPauseExecution() bool {
	if !ee.config.AutoAdjustLimits {
		return false
	}

	resources := ee.resourceMonitor.GetCurrentResources()
	
	return resources.CPUUsage > ee.config.ResourceThresholds.MaxCPUPercent*1.2 ||
		   resources.MemoryUsage > ee.config.ResourceThresholds.MaxMemoryPercent*1.2
}

// shouldRetryError determines if an error should trigger a retry
func (ee *ExecutionEngine) shouldRetryError(err error) bool {
	if !ee.config.EnableErrorRecovery {
		return false
	}

	// Define retryable error patterns
	retryablePatterns := []string{
		"timeout",
		"network",
		"connection",
		"temporary",
	}

	errStr := err.Error()
	for _, pattern := range retryablePatterns {
		if contains(errStr, pattern) {
			return true
		}
	}

	return false
}

// monitorResources continuously monitors system resources and adjusts limits
func (ee *ExecutionEngine) monitorResources() {
	ticker := time.NewTicker(ee.config.MonitoringInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ee.ctx.Done():
			return
		case <-ticker.C:
			ee.adjustResourceLimits()
		}
	}
}

// adjustResourceLimits adjusts execution limits based on current resource usage
func (ee *ExecutionEngine) adjustResourceLimits() {
	resources := ee.resourceMonitor.GetCurrentResources()
	
	// Adjust max concurrency based on resource usage
	if resources.CPUUsage > ee.config.ResourceThresholds.MaxCPUPercent {
		if ee.config.MaxConcurrency > 1 {
			ee.config.MaxConcurrency--
		}
	} else if resources.CPUUsage < ee.config.ResourceThresholds.MaxCPUPercent*0.5 {
		if ee.config.MaxConcurrency < ee.config.ResourceThresholds.MaxBrowsers {
			ee.config.MaxConcurrency++
		}
	}

	// Adjust browser manager limits
	ee.browserManager.OptimizeConcurrency()
}

// GetActiveJobs returns currently active jobs
func (ee *ExecutionEngine) GetActiveJobs() []*ExecutionJob {
	ee.jobsMutex.RLock()
	defer ee.jobsMutex.RUnlock()

	jobs := make([]*ExecutionJob, 0, len(ee.activeJobs))
	for _, job := range ee.activeJobs {
		jobs = append(jobs, job)
	}
	return jobs
}

// CancelJob cancels a specific job
func (ee *ExecutionEngine) CancelJob(jobID string) error {
	ee.jobsMutex.Lock()
	defer ee.jobsMutex.Unlock()

	job, exists := ee.activeJobs[jobID]
	if !exists {
		return fmt.Errorf("job not found: %s", jobID)
	}

	job.Cancel()
	job.Status = models.StatusCancelled
	if job.Session != nil {
		job.Session.Cancel()
	}

	return nil
}

// PauseJob pauses a specific job
func (ee *ExecutionEngine) PauseJob(jobID string) error {
	ee.jobsMutex.Lock()
	defer ee.jobsMutex.Unlock()

	job, exists := ee.activeJobs[jobID]
	if !exists {
		return fmt.Errorf("job not found: %s", jobID)
	}

	job.Status = models.StatusPaused
	if job.Session != nil {
		job.Session.Pause()
	}

	return nil
}

// ResumeJob resumes a paused job
func (ee *ExecutionEngine) ResumeJob(jobID string) error {
	ee.jobsMutex.Lock()
	defer ee.jobsMutex.Unlock()

	job, exists := ee.activeJobs[jobID]
	if !exists {
		return fmt.Errorf("job not found: %s", jobID)
	}

	job.Status = models.StatusRunning
	if job.Session != nil {
		job.Session.Start()
	}

	return nil
}

// Close shuts down the execution engine
func (ee *ExecutionEngine) Close() error {
	ee.cancel()

	// Cancel all active jobs
	ee.jobsMutex.Lock()
	for _, job := range ee.activeJobs {
		job.Cancel()
	}
	ee.jobsMutex.Unlock()

	return nil
}

// detectOptimalConcurrency detects optimal concurrency based on system specs
func detectOptimalConcurrency() int {
	numCPU := runtime.NumCPU()
	
	// Conservative approach: use 2x CPU cores, but cap at 10 for safety
	optimal := numCPU * 2
	if optimal > 10 {
		optimal = 10
	}
	if optimal < 1 {
		optimal = 1
	}
	
	return optimal
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// SaveExecutionConfig saves the execution configuration to a file
func SaveExecutionConfig(config *ExecutionConfig, filePath string) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(config)
}