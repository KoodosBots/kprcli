package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

//go:embed web/*
var webFiles embed.FS

// Profile represents a user profile with form data
type Profile struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Data      map[string]string `json:"data"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

// FormTemplate represents a saved form structure
type FormTemplate struct {
	ID       string            `json:"id"`
	URL      string            `json:"url"`
	Domain   string            `json:"domain"`
	Fields   []FormField       `json:"fields"`
	Selector map[string]string `json:"selectors"`
}

// FormField represents a single form field
type FormField struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Selector string `json:"selector"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
}

// SystemResourceUsage represents current system resource usage
type SystemResourceUsage struct {
	CPUUsage       float64   `json:"cpuUsage"`
	MemoryUsage    float64   `json:"memoryUsage"`
	MemoryTotal    uint64    `json:"memoryTotal"`
	MemoryUsed     uint64    `json:"memoryUsed"`
	MemoryFree     uint64    `json:"memoryFree"`
	GoroutineCount int       `json:"goroutineCount"`
	NumCPU         int       `json:"numCPU"`
	OSType         string    `json:"osType"`
	GoVersion      string    `json:"goVersion"`
	Uptime         float64   `json:"uptime"`
	Timestamp      time.Time `json:"timestamp"`
}

// App is our main application
type App struct {
	profiles  map[string]*Profile
	templates map[string]*FormTemplate
	mu        sync.RWMutex
	dataDir   string
	startTime time.Time
}

// NewApp creates a new application instance
func NewApp() *App {
	homeDir, _ := os.UserHomeDir()
	dataDir := filepath.Join(homeDir, ".ai-form-filler")
	os.MkdirAll(dataDir, 0755)

	app := &App{
		profiles:  make(map[string]*Profile),
		templates: make(map[string]*FormTemplate),
		dataDir:   dataDir,
		startTime: time.Now(),
	}

	app.loadData()
	return app
}

// loadData loads profiles and templates from disk
func (a *App) loadData() {
	// Load profiles
	profilesFile := filepath.Join(a.dataDir, "profiles.json")
	if data, err := os.ReadFile(profilesFile); err == nil {
		json.Unmarshal(data, &a.profiles)
	}

	// Load templates
	templatesFile := filepath.Join(a.dataDir, "templates.json")
	if data, err := os.ReadFile(templatesFile); err == nil {
		json.Unmarshal(data, &a.templates)
	}
}

// saveData saves profiles and templates to disk
func (a *App) saveData() {
	// Save profiles
	profilesFile := filepath.Join(a.dataDir, "profiles.json")
	if data, err := json.MarshalIndent(a.profiles, "", "  "); err == nil {
		os.WriteFile(profilesFile, data, 0644)
	}

	// Save templates
	templatesFile := filepath.Join(a.dataDir, "templates.json")
	if data, err := json.MarshalIndent(a.templates, "", "  "); err == nil {
		os.WriteFile(templatesFile, data, 0644)
	}
}

// HTTP Handlers

func (a *App) handleGetProfiles(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	profiles := make([]*Profile, 0, len(a.profiles))
	for _, p := range a.profiles {
		profiles = append(profiles, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profiles)
}

func (a *App) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	var profile Profile
	if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	profile.ID = fmt.Sprintf("profile_%d", time.Now().Unix())
	profile.CreatedAt = time.Now()
	profile.UpdatedAt = time.Now()

	a.mu.Lock()
	a.profiles[profile.ID] = &profile
	a.saveData()
	a.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

func (a *App) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Profile ID required", http.StatusBadRequest)
		return
	}

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	profile, exists := a.profiles[id]
	if !exists {
		http.Error(w, "Profile not found", http.StatusNotFound)
		return
	}

	// Update profile fields
	if name, ok := updates["name"].(string); ok {
		profile.Name = name
	}
	if data, ok := updates["data"].(map[string]interface{}); ok {
		profile.Data = make(map[string]string)
		for k, v := range data {
			if str, ok := v.(string); ok {
				profile.Data[k] = str
			}
		}
	}
	profile.UpdatedAt = time.Now()

	a.saveData()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

func (a *App) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Profile ID required", http.StatusBadRequest)
		return
	}

	a.mu.Lock()
	delete(a.profiles, id)
	a.saveData()
	a.mu.Unlock()

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true}`)
}

func (a *App) handleFillForm(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ProfileID string `json:"profile_id"`
		URL       string `json:"url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	a.mu.RLock()
	profile, exists := a.profiles[request.ProfileID]
	a.mu.RUnlock()

	if !exists {
		http.Error(w, "Profile not found", http.StatusNotFound)
		return
	}

	// Here we would launch browser automation
	// For MVP, we'll create a simple response
	result := map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Filling form at %s with profile %s", request.URL, profile.Name),
		"filled_fields": len(profile.Data),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleMonitoring returns system resource usage information
func (a *App) handleMonitoring(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers to allow access from any origin
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Get memory stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Calculate memory usage
	memoryUsagePercent := float64(memStats.Sys) / float64(memStats.TotalAlloc) * 100
	if memoryUsagePercent > 100 {
		memoryUsagePercent = 100
	}

	// Estimate CPU usage (simplified approach)
	numCPU := runtime.NumCPU()
	numGoroutines := runtime.NumGoroutine()
	cpuUsage := float64(numGoroutines) / float64(numCPU*10) * 100
	if cpuUsage > 100 {
		cpuUsage = 100
	}

	// Calculate uptime
	uptime := time.Since(a.startTime).Seconds()

	// Create resource usage response
	resources := SystemResourceUsage{
		CPUUsage:       cpuUsage,
		MemoryUsage:    memoryUsagePercent,
		MemoryTotal:    memStats.TotalAlloc,
		MemoryUsed:     memStats.Sys,
		MemoryFree:     memStats.TotalAlloc - memStats.Sys,
		GoroutineCount: numGoroutines,
		NumCPU:         numCPU,
		OSType:         runtime.GOOS,
		GoVersion:      runtime.Version(),
		Uptime:         uptime,
		Timestamp:      time.Now(),
	}

	// Return JSON response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resources)
}

// openBrowser opens the default browser
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("cmd", "/c", "start", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default: // linux
		err = exec.Command("xdg-open", url).Start()
	}
	if err != nil {
		log.Printf("Failed to open browser: %v", err)
	}
}

func main() {
	app := NewApp()

	// Set up HTTP routes
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/profiles", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			app.handleGetProfiles(w, r)
		case "POST":
			app.handleCreateProfile(w, r)
		case "PUT":
			app.handleUpdateProfile(w, r)
		case "DELETE":
			app.handleDeleteProfile(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/fill", app.handleFillForm)

	// Add monitoring endpoint
	mux.HandleFunc("/api/monitoring", app.handleMonitoring)

	// Serve static files
	mux.Handle("/", http.FileServer(http.FS(webFiles)))

	// Print startup message
	fmt.Println("╔════════════════════════════════════════╗")
	fmt.Println("║      AI FORM FILLER - CLI v1.0         ║")
	fmt.Println("╚════════════════════════════════════════╝")
	fmt.Println()
	fmt.Println("🚀 Starting server on http://localhost:8080")
	fmt.Println("📂 Data stored in:", app.dataDir)
	fmt.Println("📊 Monitoring available at: http://localhost:8080/api/monitoring")
	fmt.Println()
	fmt.Println("Opening browser...")

	// Open browser after a short delay
	go func() {
		time.Sleep(1 * time.Second)
		openBrowser("http://localhost:8080")
	}()

	fmt.Println("Press Ctrl+C to stop the server")
	fmt.Println()

	// Start server
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
