# AI Form Filler - User Guide

## 🚀 Quick Start

### 1. Run the Application
Double-click **`RUN.bat`** or **`ai-form-filler.exe`**

### 2. Your browser will open automatically
The app runs at http://localhost:8080

### 3. Create Your First Profile
- Click **"+ New Profile"**
- Fill in your information
- Click **"Create Profile"**

### 4. Fill Forms (Coming Soon)
- Enter a website URL
- Select your profile
- Click **"Fill Form"**

---

## 💻 How It Works

The AI Form Filler runs on your computer as a local application:

1. **Go Backend** - Manages profiles and handles automation
2. **Web Interface** - Easy-to-use interface in your browser  
3. **Local Storage** - All data saved on YOUR computer
4. **Browser Automation** - Controls browser via Playwright (coming soon)

---

## 📁 Data Storage

Your profiles are saved in:
```
C:\Users\[YourName]\.ai-form-filler\
```

Files:
- `profiles.json` - Your saved profiles
- `templates.json` - Learned form structures

---

## 🎯 Features

### Profile Management
- Create unlimited profiles
- Edit profiles anytime
- Delete profiles you don't need

### Form Filling (MVP)
- Enter any website URL
- Select a profile
- Click to fill the form

---

## 🛠️ Troubleshooting

### App won't start?
- Make sure Go is installed: https://golang.org/dl/
- Try running `ai-form-filler.exe` directly

### Browser didn't open?
- Open your browser manually
- Go to: http://localhost:8080

### Port 8080 in use?
- Close other applications using port 8080
- Or modify the port in `main.go`

---

## 🔒 Privacy & Security

✅ **100% Local** - No data sent to servers  
✅ **Your Control** - All profiles stored on YOUR computer  
✅ **Open Source** - See exactly what the code does  

---

## 📝 Next Steps

This is the MVP (Minimum Viable Product). Future features:
- Actual browser automation
- Smart form detection
- Multiple browser support
- Batch processing

---

**Need help?** Check the console output or create an issue on GitHub.
