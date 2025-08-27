# AI Form Filler - Development Makefile

.PHONY: install build test clean dev lint format help

# Default target
help:
	@echo "AI Form Filler Development Commands:"
	@echo ""
	@echo "  install     Install all dependencies"
	@echo "  build       Build all packages"
	@echo "  test        Run all tests"
	@echo "  dev         Start development mode"
	@echo "  lint        Lint all code"
	@echo "  format      Format all code"
	@echo "  clean       Clean build artifacts"
	@echo "  extension   Build Chrome extension"
	@echo "  cli         Build CLI tool"
	@echo ""

# Install dependencies
install:
	npm install
	cd packages/cli && go mod tidy

# Build all packages
build: build-shared build-extension build-cli

build-shared:
	cd packages/shared && npm run build

build-extension:
	cd packages/extension && npm run build

build-cli:
	cd packages/cli && go build -o ai-form-filler.exe

# Development mode
dev:
	npm run dev

# Testing
test:
	npm run test
	cd packages/cli && go test ./...

# Linting
lint:
	npm run lint
	cd packages/cli && go vet ./...

# Formatting
format:
	npm run format
	cd packages/cli && go fmt ./...

# Clean build artifacts
clean:
	rm -rf packages/*/dist
	rm -rf packages/*/node_modules/.cache
	rm -f packages/cli/ai-form-filler.exe
	rm -f packages/cli/ai-form-filler

# Platform-specific builds
build-windows:
	cd packages/cli && GOOS=windows GOARCH=amd64 go build -o ai-form-filler.exe

build-mac:
	cd packages/cli && GOOS=darwin GOARCH=amd64 go build -o ai-form-filler-mac

build-linux:
	cd packages/cli && GOOS=linux GOARCH=amd64 go build -o ai-form-filler-linux

# Extension packaging
package-extension:
	cd packages/extension && npm run build
	cd packages/extension/dist && zip -r ../ai-form-filler-extension.zip .

# Development setup
setup: install build
	@echo "Setup complete! You can now:"
	@echo "  - Load the extension from packages/extension/dist"
	@echo "  - Run the CLI with packages/cli/ai-form-filler.exe dashboard"
	@echo "  - Start development with 'make dev'"