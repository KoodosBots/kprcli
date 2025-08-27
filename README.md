# AI Form Filler

An intelligent automation platform that learns to fill out web forms automatically using AI. The system consists of a CLI tool with web interface that provides automated form filling capabilities through browser automation.

## 🚀 Features

- **AI-Powered Learning**: Automatically learns form structures and creates reusable templates
- **Web Interface**: Beautiful localhost web UI for profile management
- **Parallel Execution**: Run multiple browsers simultaneously with resource optimization
- **Profile Management**: Secure local storage of client data
- **Browser Automation**: Direct browser control via Playwright (coming soon)
- **Self-Improvement**: AI agents that learn from failures and optimize templates
- **Simple Architecture**: Single executable with web interface

## 🏗️ Architecture

The project has a simple, clean structure:

```
/
├── cmd/            # CLI commands
├── internal/       # Core business logic
├── web/            # Web interface (HTML/JS/CSS)
└── main.go         # Entry point
```

## 🛠️ Development Setup

### Prerequisites

- Go 1.21+
- Chrome/Chromium browser

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-form-filler
```

2. Build the application:
```bash
go build -o ai-form-filler.exe main.go
```

### Development Commands

```bash
# Build
go build -o ai-form-filler.exe main.go

# Run
./ai-form-filler.exe

# Test
go test ./...
```

## 🎯 Getting Started

### 1. Build & Run

```bash
# Build
go build -o ai-form-filler.exe main.go

# Run
./ai-form-filler.exe
# or use the launcher
RUN.bat
```

### 2. Access Web Interface

Open your browser to: http://localhost:8080

### 3. Create Profiles

1. Click "+ New Profile"
2. Fill in your information
3. Save the profile

### 4. Fill Forms (Coming Soon)

1. Enter a website URL
2. Select a profile
3. Click "Fill Form"
4. Watch as the form is automatically filled

## 🔧 Configuration

### Application Configuration

Configuration is stored in `~/.ai-form-filler/`:

- `profiles.json` - User profiles
- `templates.json` - Form templates
- `config.json` - Application settings

## 🧪 Testing

```bash
# Run all tests
go test ./...

# Run with coverage
go test -cover ./...

# Run specific package
go test ./internal/...
```

## 📦 Building for Production

```bash
# Windows
go build -o ai-form-filler.exe main.go

# macOS
GOOS=darwin GOARCH=amd64 go build -o ai-form-filler-mac main.go

# Linux
GOOS=linux GOARCH=amd64 go build -o ai-form-filler-linux main.go
```

## 🚀 Deployment

### Distribution

1. Build the executable for your platform
2. Copy the `web/` folder to the same directory
3. Run the executable
4. Access at http://localhost:8080

### Docker (Optional)

```dockerfile
FROM golang:1.21-alpine
WORKDIR /app
COPY . .
RUN go build -o ai-form-filler main.go
CMD ["./ai-form-filler"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Documentation: [docs.ai-form-filler.com](https://docs.ai-form-filler.com)
- Issues: [GitHub Issues](https://github.com/ai-form-filler/issues)
- Telegram: [@ai_form_filler_support](https://t.me/ai_form_filler_support)

## 🗺️ Roadmap

- [x] Project structure and development environment
- [x] Web interface for profile management
- [x] Local data storage
- [ ] Playwright browser automation integration
- [ ] Form detection and analysis
- [ ] Field mapping engine
- [ ] AI integration for smart filling
- [ ] Parallel browser execution
- [ ] CAPTCHA handling
- [ ] Cloud deployment
