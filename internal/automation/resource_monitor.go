package automation

import (
	"runtime"
	"sync"
	"time"
)

// ResourceMonitor monitors system resources and provides optimization recommendations
type ResourceMonitor struct {
	currentResources *SystemResourceUsage
	history          []ResourceSnapshot
	mutex            sync.RWMutex
	lastUpdate       time.Time
}

// SystemResourceUsage represents current system resource usage
type SystemResourceUsage struct {
	CPUUsage      float64   `json:"cpuUsage"`
	MemoryUsage   float64   `json:"memoryUsage"`
	MemoryTotal   int64     `json:"memoryTotal"`
	MemoryUsed    int64     `json:"memoryUsed"`
	MemoryFree    int64     `json:"memoryFree"`
	GoroutineCount int      `json:"goroutineCount"`
	HeapSize      int64     `json:"heapSize"`
	HeapUsed      int64     `json:"heapUsed"`
	GCPauses      int64     `json:"gcPauses"`
	Timestamp     time.Time `json:"timestamp"`
}

// ResourceSnapshot represents a point-in-time resource measurement
type ResourceSnapshot struct {
	Timestamp time.Time            `json:"timestamp"`
	Resources SystemResourceUsage  `json:"resources"`
}

// ResourceRecommendation provides optimization recommendations
type ResourceRecommendation struct {
	Type        string `json:"type"`        // "increase", "decrease", "maintain"
	Component   string `json:"component"`   // "concurrency", "memory", "cpu"
	Current     int    `json:"current"`
	Recommended int    `json:"recommended"`
	Reason      string `json:"reason"`
	Confidence  float64 `json:"confidence"` // 0.0 to 1.0
}

// NewResourceMonitor creates a new resource monitor
func NewResourceMonitor() *ResourceMonitor {
	monitor := &ResourceMonitor{
		currentResources: &SystemResourceUsage{},
		history:          make([]ResourceSnapshot, 0, 100), // Keep last 100 snapshots
	}
	
	// Take initial measurement
	monitor.updateResources()
	
	return monitor
}

// GetCurrentResources returns the current resource usage
func (rm *ResourceMonitor) GetCurrentResources() *SystemResourceUsage {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()
	
	// Update if data is stale (older than 5 seconds)
	if time.Since(rm.lastUpdate) > 5*time.Second {
		rm.mutex.RUnlock()
		rm.updateResources()
		rm.mutex.RLock()
	}
	
	// Return a copy to avoid race conditions
	resources := *rm.currentResources
	return &resources
}

// updateResources updates the current resource measurements
func (rm *ResourceMonitor) updateResources() {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()
	
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	
	// Calculate memory usage
	totalMemory := int64(16 * 1024 * 1024 * 1024) // Default to 16GB, should be detected from system
	usedMemory := int64(memStats.Sys)
	freeMemory := totalMemory - usedMemory
	memoryUsagePercent := float64(usedMemory) / float64(totalMemory) * 100
	
	// Estimate CPU usage (simplified approach)
	cpuUsage := rm.estimateCPUUsage()
	
	rm.currentResources = &SystemResourceUsage{
		CPUUsage:       cpuUsage,
		MemoryUsage:    memoryUsagePercent,
		MemoryTotal:    totalMemory,
		MemoryUsed:     usedMemory,
		MemoryFree:     freeMemory,
		GoroutineCount: runtime.NumGoroutine(),
		HeapSize:       int64(memStats.HeapSys),
		HeapUsed:       int64(memStats.HeapInuse),
		GCPauses:       int64(memStats.PauseNs[(memStats.NumGC+255)%256]),
		Timestamp:      time.Now(),
	}
	
	rm.lastUpdate = time.Now()
	
	// Add to history
	snapshot := ResourceSnapshot{
		Timestamp: rm.lastUpdate,
		Resources: *rm.currentResources,
	}
	
	rm.history = append(rm.history, snapshot)
	
	// Keep only last 100 snapshots
	if len(rm.history) > 100 {
		rm.history = rm.history[1:]
	}
}

// estimateCPUUsage provides a simple CPU usage estimation
func (rm *ResourceMonitor) estimateCPUUsage() float64 {
	// This is a simplified approach. In a production system, you'd use
	// platform-specific APIs or libraries like gopsutil
	
	numCPU := runtime.NumCPU()
	numGoroutines := runtime.NumGoroutine()
	
	// Rough estimation based on goroutine count and CPU cores
	// This is not accurate but provides a basic indication
	usage := float64(numGoroutines) / float64(numCPU*10) * 100
	
	if usage > 100 {
		usage = 100
	}
	
	return usage
}

// GetResourceHistory returns the resource usage history
func (rm *ResourceMonitor) GetResourceHistory() []ResourceSnapshot {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()
	
	// Return a copy of the history
	history := make([]ResourceSnapshot, len(rm.history))
	copy(history, rm.history)
	return history
}

// GetOptimalConcurrency calculates optimal concurrency based on current resources
func (rm *ResourceMonitor) GetOptimalConcurrency(currentConcurrency int) int {
	resources := rm.GetCurrentResources()
	
	// Base calculation on CPU and memory usage
	cpuFactor := 1.0
	memoryFactor := 1.0
	
	// Adjust based on CPU usage
	if resources.CPUUsage > 80 {
		cpuFactor = 0.7 // Reduce concurrency
	} else if resources.CPUUsage < 40 {
		cpuFactor = 1.3 // Increase concurrency
	}
	
	// Adjust based on memory usage
	if resources.MemoryUsage > 75 {
		memoryFactor = 0.8 // Reduce concurrency
	} else if resources.MemoryUsage < 50 {
		memoryFactor = 1.2 // Increase concurrency
	}
	
	// Calculate new concurrency
	factor := (cpuFactor + memoryFactor) / 2
	newConcurrency := int(float64(currentConcurrency) * factor)
	
	// Apply bounds
	minConcurrency := 1
	maxConcurrency := runtime.NumCPU() * 4 // Conservative maximum
	
	if newConcurrency < minConcurrency {
		newConcurrency = minConcurrency
	}
	if newConcurrency > maxConcurrency {
		newConcurrency = maxConcurrency
	}
	
	return newConcurrency
}

// GetRecommendations returns optimization recommendations
func (rm *ResourceMonitor) GetRecommendations(currentConcurrency int) []ResourceRecommendation {
	resources := rm.GetCurrentResources()
	recommendations := make([]ResourceRecommendation, 0)
	
	// CPU-based recommendations
	if resources.CPUUsage > 85 {
		recommendations = append(recommendations, ResourceRecommendation{
			Type:        "decrease",
			Component:   "concurrency",
			Current:     currentConcurrency,
			Recommended: max(1, currentConcurrency-2),
			Reason:      "High CPU usage detected",
			Confidence:  0.8,
		})
	} else if resources.CPUUsage < 30 && currentConcurrency < runtime.NumCPU()*2 {
		recommendations = append(recommendations, ResourceRecommendation{
			Type:        "increase",
			Component:   "concurrency",
			Current:     currentConcurrency,
			Recommended: currentConcurrency + 1,
			Reason:      "Low CPU usage, can handle more load",
			Confidence:  0.6,
		})
	}
	
	// Memory-based recommendations
	if resources.MemoryUsage > 80 {
		recommendations = append(recommendations, ResourceRecommendation{
			Type:        "decrease",
			Component:   "memory",
			Current:     int(resources.MemoryUsage),
			Recommended: 70,
			Reason:      "High memory usage detected",
			Confidence:  0.9,
		})
	}
	
	// GC-based recommendations
	if resources.GCPauses > 10000000 { // 10ms in nanoseconds
		recommendations = append(recommendations, ResourceRecommendation{
			Type:        "decrease",
			Component:   "concurrency",
			Current:     currentConcurrency,
			Recommended: max(1, currentConcurrency-1),
			Reason:      "High GC pause times detected",
			Confidence:  0.7,
		})
	}
	
	return recommendations
}

// IsSystemHealthy checks if the system is operating within healthy parameters
func (rm *ResourceMonitor) IsSystemHealthy() bool {
	resources := rm.GetCurrentResources()
	
	// Define healthy thresholds
	maxCPU := 85.0
	maxMemory := 80.0
	maxGoroutines := 10000
	
	return resources.CPUUsage < maxCPU &&
		   resources.MemoryUsage < maxMemory &&
		   resources.GoroutineCount < maxGoroutines
}

// GetSystemInfo returns basic system information
func (rm *ResourceMonitor) GetSystemInfo() map[string]interface{} {
	return map[string]interface{}{
		"numCPU":      runtime.NumCPU(),
		"goVersion":   runtime.Version(),
		"os":          runtime.GOOS,
		"arch":        runtime.GOARCH,
		"goroutines":  runtime.NumGoroutine(),
		"timestamp":   time.Now(),
	}
}

// StartContinuousMonitoring starts continuous resource monitoring
func (rm *ResourceMonitor) StartContinuousMonitoring(interval time.Duration) chan ResourceSnapshot {
	updates := make(chan ResourceSnapshot, 10)
	
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		defer close(updates)
		
		for {
			select {
			case <-ticker.C:
				rm.updateResources()
				resources := rm.GetCurrentResources()
				
				snapshot := ResourceSnapshot{
					Timestamp: time.Now(),
					Resources: *resources,
				}
				
				select {
				case updates <- snapshot:
				default:
					// Channel is full, skip this update
				}
			}
		}
	}()
	
	return updates
}

// CalculateResourceEfficiency calculates how efficiently resources are being used
func (rm *ResourceMonitor) CalculateResourceEfficiency() float64 {
	resources := rm.GetCurrentResources()
	
	// Simple efficiency calculation
	// Ideal usage is around 60-70% for both CPU and memory
	idealCPU := 65.0
	idealMemory := 60.0
	
	cpuEfficiency := 1.0 - (abs(resources.CPUUsage-idealCPU) / 100.0)
	memoryEfficiency := 1.0 - (abs(resources.MemoryUsage-idealMemory) / 100.0)
	
	// Average efficiency
	efficiency := (cpuEfficiency + memoryEfficiency) / 2.0
	
	if efficiency < 0 {
		efficiency = 0
	}
	
	return efficiency
}

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// PredictResourceNeeds predicts future resource needs based on current trends
func (rm *ResourceMonitor) PredictResourceNeeds(lookAheadMinutes int) *SystemResourceUsage {
	history := rm.GetResourceHistory()
	
	if len(history) < 2 {
		// Not enough data for prediction, return current usage
		return rm.GetCurrentResources()
	}
	
	// Simple linear trend analysis
	recent := history[len(history)-1].Resources
	older := history[max(0, len(history)-10)].Resources // Look at last 10 snapshots
	
	timeDiff := recent.Timestamp.Sub(older.Timestamp).Minutes()
	if timeDiff == 0 {
		return &recent
	}
	
	// Calculate trends
	cpuTrend := (recent.CPUUsage - older.CPUUsage) / timeDiff
	memoryTrend := (recent.MemoryUsage - older.MemoryUsage) / timeDiff
	
	// Project forward
	futureMinutes := float64(lookAheadMinutes)
	predictedCPU := recent.CPUUsage + (cpuTrend * futureMinutes)
	predictedMemory := recent.MemoryUsage + (memoryTrend * futureMinutes)
	
	// Apply bounds
	if predictedCPU < 0 {
		predictedCPU = 0
	}
	if predictedCPU > 100 {
		predictedCPU = 100
	}
	if predictedMemory < 0 {
		predictedMemory = 0
	}
	if predictedMemory > 100 {
		predictedMemory = 100
	}
	
	prediction := recent
	prediction.CPUUsage = predictedCPU
	prediction.MemoryUsage = predictedMemory
	prediction.Timestamp = time.Now().Add(time.Duration(lookAheadMinutes) * time.Minute)
	
	return &prediction
}