# Production Dockerfile for CLI
FROM golang:1.21-alpine AS builder

# Install dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ai-form-filler .

# Final stage
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Install ca-certificates for HTTPS
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/ai-form-filler .

# Create data directory
RUN mkdir -p /data

# Set permissions
RUN chmod +x ./ai-form-filler

# Expose port (if needed for web interface)
EXPOSE 8080

# Run the application
CMD ["./ai-form-filler", "dashboard"]