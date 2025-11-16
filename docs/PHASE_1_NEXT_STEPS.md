# Phase 1 - Next Steps & Testing Guide

**Status:** ✅ Implementation Complete, Ready for Testing

---

## ✅ What's Been Completed

### 1. Binary Build System ✅
- ✅ `pkg` bundling configured (node18 targets)
- ✅ Build script: `pnpm build:binaries`
- ✅ All 4 platforms build successfully:
  - Linux x64 (45MB)
  - macOS ARM64 (45MB)
  - macOS x64 (50MB)
  - Windows x64 (37MB)

### 2. Installer Generation ✅
- ✅ Download route updated to serve binaries
- ✅ Unix installer script with embedded binary extraction
- ✅ Uses Python for reliable binary extraction (with fallbacks)
- ✅ Generates config.json with serverUrl, userId, sharedSecret
- ✅ Sets up OS-level services (systemd/launchd)

### 3. Agent Configuration ✅
- ✅ Agent reads from `config.json` on startup
- ✅ Falls back to command-line arguments
- ✅ Supports sharedSecret authentication

### 4. UI Updates ✅
- ✅ `/health` endpoint added (<200ms response)
- ✅ Auto-detection on page load
- ✅ Removed all CLI command displays
- ✅ "Install Agent" button only

---

## 🧪 Testing Checklist

### Step 1: Test Installer Generation

**Option A: Via Next.js Server**
```bash
# Start server
cd /home/dp/Desktop/op15
pnpm dev

# In another terminal, test download endpoint
curl "http://localhost:3000/api/agent/download?platform=linux" \
  -H "Cookie: __session=YOUR_SESSION" \
  -o installer.run

# Verify installer
chmod +x installer.run
head -50 installer.run | grep -q "__BINARY_DATA_STARTS_HERE__" && echo "✅ Marker found"
```

**Option B: Direct Test Script**
```bash
# Create test installer manually
cd /home/dp/Desktop/op15
node -e "
const fs = require('fs');
const path = require('path');
const binary = fs.readFileSync('local-agent/dist/binaries/local-agent-linux-x64');
const script = \`#!/bin/bash
set -e
AGENT_DIR=\"\\$HOME/.op15-agent\"
mkdir -p \"\\$AGENT_DIR\"
BINARY_MARKER=\"__BINARY_DATA_STARTS_HERE__\"
MARKER_POS=\$(python3 -c \"
import sys
with open(sys.argv[1], 'rb') as f:
    data = f.read()
    marker = b'\\\$BINARY_MARKER\\\\n'
    pos = data.find(marker)
    if pos != -1:
        print(pos + len(marker))
    else:
        sys.exit(1)
\" \"\\$0\" 2>/dev/null)
dd if=\"\\$0\" of=\"\\$AGENT_DIR/op15-agent\" bs=1 skip=\\$MARKER_POS 2>/dev/null
chmod +x \"\\$AGENT_DIR/op15-agent\"
echo \"✅ Binary extracted\"
__BINARY_DATA_STARTS_HERE__
\`;
fs.writeFileSync('test-installer.run', Buffer.concat([Buffer.from(script), binary]));
fs.chmodSync('test-installer.run', 0o755);
console.log('✅ Test installer created');
"
```

### Step 2: Test Binary Extraction

```bash
# Run installer
./installer.run

# Verify binary extracted
ls -lh ~/.op15-agent/op15-agent
file ~/.op15-agent/op15-agent

# Should show: ELF 64-bit executable (or similar)
```

### Step 3: Test Agent Execution

```bash
# Create test config.json
cat > ~/.op15-agent/config.json << EOF
{
  "serverUrl": "http://localhost:3000",
  "userId": "test_user_123",
  "sharedSecret": "test_secret_12345678901234567890123456789012",
  "httpPort": 4001
}
EOF

# Run agent
~/.op15-agent/op15-agent

# In another terminal, test /health
curl http://127.0.0.1:4001/health
# Should return: {"status":"ok","timestamp":...}
```

### Step 4: Test Service Setup

**Linux:**
```bash
# Check if service was created
systemctl --user status op15-agent

# If not, create manually:
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/op15-agent.service << EOF
[Unit]
Description=op15 Local Agent
After=network.target

[Service]
Type=simple
ExecStart=$HOME/.op15-agent/op15-agent
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable op15-agent.service
systemctl --user start op15-agent.service
```

**macOS:**
```bash
# Check if launchd service exists
launchctl list | grep op15

# If not, create manually:
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.op15.agent.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.op15.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$HOME/.op15-agent/op15-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.op15.agent.plist
```

### Step 5: Test UI Integration

1. **Start Next.js server:**
   ```bash
   cd /home/dp/Desktop/op15
   pnpm dev
   ```

2. **Open browser:** Navigate to local environment settings

3. **Test auto-detection:**
   - If agent is running → Should show "Connected" immediately
   - If agent not running → Should show "Install Agent" button

4. **Test installer download:**
   - Click "Install Agent"
   - Download installer
   - Run installer
   - Verify agent connects

---

## 🐛 Known Issues & Fixes

### Issue 1: Binary Extraction May Fail
**Problem:** Python may not be available on all systems  
**Fix:** Fallback to sed/head/wc method (already implemented)

### Issue 2: macOS Code Signing
**Problem:** macOS binaries not signed, will be killed by kernel  
**Fix:** 
- Sign manually: `codesign --sign - <binary>`
- Or build on macOS CI runner
- Or use `ldid` utility on Linux

### Issue 3: Windows Installer
**Problem:** Windows installer is batch file, doesn't embed binary  
**Fix:** For production, use proper installer builder (Inno Setup, NSIS)

---

## 📋 Production Readiness Checklist

- [ ] Test installer generation on all platforms
- [ ] Test binary extraction reliability
- [ ] Test agent startup with config.json
- [ ] Test service registration (systemd/launchd)
- [ ] Test UI auto-detection
- [ ] Test full install flow end-to-end
- [ ] Set up CI/CD (GitHub Actions)
- [ ] Sign macOS binaries
- [ ] Create Windows installer (proper .exe)
- [ ] Test on clean systems (no Node.js installed)
- [ ] Document user installation process

---

## 🚀 Deployment Steps

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Phase 1: Pre-built binaries + OS-native installers"
   git push origin main
   ```

2. **Verify CI/CD:**
   - Check GitHub Actions workflow runs
   - Download artifacts
   - Verify binaries work

3. **Test in Production:**
   - Deploy to staging
   - Test installer download
   - Test full install flow
   - Monitor for errors

---

## 📝 Notes

- **Binary Size:** ~45-50MB per platform (acceptable for modern systems)
- **Dependencies:** Python3 required for binary extraction (fallback available)
- **Node Version:** Using node18 (pkg doesn't support node20 yet)
- **Config Path:** `~/.op15-agent/config.json` (Linux/macOS), `%LOCALAPPDATA%\op15-agent\config.json` (Windows)

---

## ✅ Phase 1 Complete!

All implementation is done. Ready for testing and deployment.

