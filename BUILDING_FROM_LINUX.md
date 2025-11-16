# Building Installers from Linux

## ✅ What CAN Be Done from Linux

### 1. Build Agent Binaries (All Platforms) ✅
```bash
cd local-agent
pnpm build              # Compile TypeScript
pnpm build:binaries     # Cross-compile for Windows + Linux + macOS
```

**Result:** Creates binaries in `local-agent/dist/binaries/`:
- ✅ `local-agent-linux-x64` (native)
- ✅ `local-agent-win-x64.exe` (cross-compiled via pkg)
- ✅ `local-agent-macos-x64` (cross-compiled via pkg)
- ✅ `local-agent-macos-arm64` (cross-compiled via pkg)

**Note:** `pkg` supports cross-compilation, so you can build Windows binaries from Linux!

### 2. Build Linux Installer ✅
```bash
# This works perfectly from Linux
# The installer is just a shell script
```

**Result:** Creates `installers/OP15-Agent-Installer.sh`

### 3. Test Linux Installer ✅
```bash
# Can test locally
chmod +x installers/OP15-Agent-Installer.sh
./installers/OP15-Agent-Installer.sh
```

## ⚠️ Windows Installer: Options

### Option A: Use Wine (Works from Linux) ✅

The Windows installer builder now supports Wine! Here's how:

```bash
# 1. Install Wine
sudo apt-get install wine wine64

# 2. Download Inno Setup installer
wget https://jrsoftware.org/download.php/is.exe -O /tmp/inno-setup.exe

# 3. Install Inno Setup via Wine
wine /tmp/inno-setup.exe

# 4. Set environment variable (optional, auto-detected)
export INNO_SETUP_PATH="$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe"

# 5. Build Windows installer from Linux!
# The download endpoint will automatically use Wine
```

**The builder now auto-detects Wine** - no manual configuration needed!

### Option B: Build on Windows Machine

1. Build binaries on Linux (cross-compilation works!)
2. Copy `local-agent/dist/binaries/local-agent-win-x64.exe` to Windows machine
3. Build installer on Windows with Inno Setup installed

### Option C: Use CI/CD (Best for Production)

Set up GitHub Actions with Windows runner:
```yaml
# .github/workflows/build-installers.yml
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: cd local-agent && npm run build:binaries
      - run: # Build Windows installer
```

## 🚀 Quick Start: Build Everything from Linux

```bash
# 1. Build all binaries (including Windows)
cd local-agent
pnpm install
pnpm build
pnpm build:binaries

# 2. Install Wine (for Windows installer)
sudo apt-get install wine wine64

# 3. Install Inno Setup via Wine
wget https://jrsoftware.org/download.php/is.exe -O /tmp/inno-setup.exe
wine /tmp/inno-setup.exe
# Follow the installer prompts

# 4. Test installer generation
# Start your Next.js server
pnpm dev

# In another terminal, test the download endpoint
curl -H "Cookie: your-auth-cookie" \
  "http://localhost:3000/api/agent/download?platform=win32" \
  -o OP15-Agent-Setup.exe

# 5. Test Linux installer
curl -H "Cookie: your-auth-cookie" \
  "http://localhost:3000/api/agent/download?platform=linux" \
  -o OP15-Agent-Installer.sh
chmod +x OP15-Agent-Installer.sh
```

## 📝 Summary

| Task | Can Do from Linux? | Notes |
|------|-------------------|-------|
| Build Windows binary | ✅ Yes | Cross-compilation via pkg |
| Build Linux binary | ✅ Yes | Native |
| Build Linux installer | ✅ Yes | Pure shell script |
| Build Windows installer | ✅ Yes | With Wine |
| Test Linux installer | ✅ Yes | Native |
| Test Windows installer | ❌ No | Need Windows VM or Wine |

## 🎯 Recommended Workflow

**For Development (Linux):**
1. Build all binaries (cross-compilation works!)
2. Build Linux installer (works natively)
3. Build Windows installer via Wine (now supported!)
4. Test Linux installer locally
5. Test Windows installer in Windows VM

**For Production:**
- Use CI/CD with Windows runner for Windows installer
- Build Linux installer from any platform
- Store binaries in GitHub Releases or S3

---

**Bottom Line:** You can build **everything from Linux** now! 🎉

The Windows installer builder has been updated to automatically detect and use Wine if you're on Linux.
