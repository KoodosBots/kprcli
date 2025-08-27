package automation

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// SystemSpecification holds detailed hardware information
type SystemSpecification struct {
	CPUCores       int     `json:"cpuCores"`
	CPUThreads     int     `json:"cpuThreads"`
	CPUModel       string  `json:"cpuModel"`
	CPUSpeed       float64 `json:"cpuSpeedGhz"`
	RAMTotal       int64   `json:"ramTotalMB"`
	RAMAvailable   int64   `json:"ramAvailableMB"`
	DiskTotal      int64   `json:"diskTotalGB"`
	DiskFree       int64   `json:"diskFreeGB"`
	GPUModel       string  `json:"gpuModel,omitempty"`
	GPUMemory      int64   `json:"gpuMemoryMB,omitempty"`
	NetworkSpeed   int     `json:"networkSpeedMbps,omitempty"`
	OptimalSites   int     `json:"optimalSites"`
	MaxSites       int     `json:"maxSites"`
	ScanTime       time.Time `json:"scanTime"`
	OperatingSystem string  `json:"operatingSystem"`
}

// ScanSystemSpecifications performs a comprehensive scan of system hardware
func ScanSystemSpecifications() (*SystemSpecification, error) {
	spec := &SystemSpecification{
		ScanTime: time.Now(),
		OperatingSystem: runtime.GOOS,
	}

	// Get CPU information
	spec.CPUCores = runtime.NumCPU()
	spec.CPUThreads = spec.CPUCores // Default if we can't determine hyperthreading
	
	// Get CPU model and speed
	if runtime.GOOS == "windows" {
		// Use PowerShell to get CPU info on Windows
		cmd := exec.Command("powershell", "-Command", "Get-WmiObject -Class Win32_Processor | Select-Object -Property Name, MaxClockSpeed | ConvertTo-Json")
		output, err := cmd.Output()
		if err == nil {
			outputStr := string(output)
			if strings.Contains(outputStr, "Name") {
				// Extract CPU model name
				nameParts := strings.Split(outputStr, "\"Name\":\"")
				if len(nameParts) > 1 {
					modelParts := strings.Split(nameParts[1], "\"")
					if len(modelParts) > 0 {
						spec.CPUModel = modelParts[0]
					}
				}
				
				// Extract CPU speed
				speedParts := strings.Split(outputStr, "\"MaxClockSpeed\":\"")
				if len(speedParts) > 1 {
					speedStr := strings.Split(speedParts[1], "\"")
					if len(speedStr) > 0 {
						speed, err := strconv.ParseFloat(strings.TrimSpace(speedStr[0]), 64)
						if err == nil {
							spec.CPUSpeed = speed / 1000 // Convert MHz to GHz
						}
					}
				}
			}
		}
		
		// Get RAM information
		cmd = exec.Command("powershell", "-Command", "Get-WmiObject -Class Win32_ComputerSystem | Select-Object -Property TotalPhysicalMemory | ConvertTo-Json")
		output, err = cmd.Output()
		if err == nil {
			outputStr := string(output)
			if strings.Contains(outputStr, "TotalPhysicalMemory") {
				memParts := strings.Split(outputStr, "\"TotalPhysicalMemory\":\"")
				if len(memParts) > 1 {
					memStr := strings.Split(memParts[1], "\"")
					if len(memStr) > 0 {
						mem, err := strconv.ParseInt(strings.TrimSpace(memStr[0]), 10, 64)
						if err == nil {
							spec.RAMTotal = mem / (1024 * 1024) // Convert bytes to MB
						}
					}
				}
			}
		}
		
		// Get available RAM
		cmd = exec.Command("powershell", "-Command", "Get-WmiObject -Class Win32_OperatingSystem | Select-Object -Property FreePhysicalMemory | ConvertTo-Json")
		output, err = cmd.Output()
		if err == nil {
			outputStr := string(output)
			if strings.Contains(outputStr, "FreePhysicalMemory") {
				memParts := strings.Split(outputStr, "\"FreePhysicalMemory\":\"")
				if len(memParts) > 1 {
					memStr := strings.Split(memParts[1], "\"")
					if len(memStr) > 0 {
						mem, err := strconv.ParseInt(strings.TrimSpace(memStr[0]), 10, 64)
						if err == nil {
							spec.RAMAvailable = mem // Already in KB, convert to MB
						}
					}
				}
			}
		}
		
		// Get disk information
		cmd = exec.Command("powershell", "-Command", "Get-WmiObject -Class Win32_LogicalDisk -Filter \"DeviceID='C:'\" | Select-Object -Property Size,FreeSpace | ConvertTo-Json")
		output, err = cmd.Output()
		if err == nil {
			outputStr := string(output)
			if strings.Contains(outputStr, "Size") {
				// Extract total disk size
				sizeParts := strings.Split(outputStr, "\"Size\":\"")
				if len(sizeParts) > 1 {
					sizeStr := strings.Split(sizeParts[1], "\"")
					if len(sizeStr) > 0 {
						size, err := strconv.ParseInt(strings.TrimSpace(sizeStr[0]), 10, 64)
						if err == nil {
							spec.DiskTotal = size / (1024 * 1024 * 1024) // Convert bytes to GB
						}
					}
				}
				
				// Extract free disk space
				freeParts := strings.Split(outputStr, "\"FreeSpace\":\"")
				if len(freeParts) > 1 {
					freeStr := strings.Split(freeParts[1], "\"")
					if len(freeStr) > 0 {
						free, err := strconv.ParseInt(strings.TrimSpace(freeStr[0]), 10, 64)
						if err == nil {
							spec.DiskFree = free / (1024 * 1024 * 1024) // Convert bytes to GB
						}
					}
				}
			}
		}
		
		// Try to get GPU information
		cmd = exec.Command("powershell", "-Command", "Get-WmiObject -Class Win32_VideoController | Select-Object -Property Name,AdapterRAM | ConvertTo-Json")
		output, err = cmd.Output()
		if err == nil {
			outputStr := string(output)
			if strings.Contains(outputStr, "Name") {
				// Extract GPU model
				nameParts := strings.Split(outputStr, "\"Name\":\"")
				if len(nameParts) > 1 {
					modelParts := strings.Split(nameParts[1], "\"")
					if len(modelParts) > 0 {
						spec.GPUModel = modelParts[0]
					}
				}
				
				// Extract GPU memory
				memParts := strings.Split(outputStr, "\"AdapterRAM\":\"")
				if len(memParts) > 1 {
					memStr := strings.Split(memParts[1], "\"")
					if len(memStr) > 0 {
						mem, err := strconv.ParseInt(strings.TrimSpace(memStr[0]), 10, 64)
						if err == nil {
							spec.GPUMemory = mem / (1024 * 1024) // Convert bytes to MB
						}
					}
				}
			}
		}
	} else {
		// For non-Windows platforms, use simpler defaults
		spec.CPUModel = "Unknown CPU"
		spec.CPUSpeed = 0.0
		spec.RAMTotal = 8192 // Assume 8GB
		spec.RAMAvailable = 4096 // Assume 4GB available
		spec.DiskTotal = 100
		spec.DiskFree = 50
	}

	// Calculate optimal and maximum sites
	spec.OptimalSites = calculateOptimalSites(spec)
	spec.MaxSites = calculateMaxSites(spec)

	return spec, nil
}

// calculateOptimalSites determines the optimal number of concurrent sites
// based on system specifications
func calculateOptimalSites(spec *SystemSpecification) int {
	// Base calculation on CPU cores and available RAM
	cpuFactor := float64(spec.CPUCores) * 1.5
	
	// RAM factor - assume each browser instance needs about 300MB
	ramFactor := float64(spec.RAMAvailable) / 300.0
	
	// Take the lower of the two factors
	optimal := int(min(cpuFactor, ramFactor))
	
	// Apply reasonable bounds
	if optimal < 1 {
		optimal = 1
	}
	if optimal > 20 {
		optimal = 20 // Cap at 20 for safety
	}
	
	return optimal
}

// calculateMaxSites determines the maximum number of concurrent sites
// the system could potentially handle (not recommended for regular use)
func calculateMaxSites(spec *SystemSpecification) int {
	// More aggressive calculation
	cpuFactor := float64(spec.CPUCores) * 2.5
	
	// RAM factor - assume each browser instance needs about 250MB minimum
	ramFactor := float64(spec.RAMAvailable) / 250.0
	
	// Take the lower of the two factors
	max := int(min(cpuFactor, ramFactor))
	
	// Apply bounds
	if max < 1 {
		max = 1
	}
	if max > 30 {
		max = 30 // Hard cap at 30
	}
	
	return max
}

// min returns the minimum of two float64 values
func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// GetSystemSpecSummary returns a human-readable summary of system specifications
func GetSystemSpecSummary(spec *SystemSpecification) string {
	summary := fmt.Sprintf("System Specifications:\n")
	summary += fmt.Sprintf("CPU: %s (%d cores, %.2f GHz)\n", spec.CPUModel, spec.CPUCores, spec.CPUSpeed)
	summary += fmt.Sprintf("RAM: %d MB (%.1f GB)\n", spec.RAMTotal, float64(spec.RAMTotal)/1024.0)
	summary += fmt.Sprintf("Disk: %d GB free of %d GB total\n", spec.DiskFree, spec.DiskTotal)
	
	if spec.GPUModel != "" {
		summary += fmt.Sprintf("GPU: %s (%d MB)\n", spec.GPUModel, spec.GPUMemory)
	}
	
	summary += fmt.Sprintf("\nBased on your system specifications:\n")
	summary += fmt.Sprintf("Optimal concurrent sites: %d\n", spec.OptimalSites)
	summary += fmt.Sprintf("Maximum concurrent sites: %d (not recommended for regular use)\n", spec.MaxSites)
	
	return summary
}