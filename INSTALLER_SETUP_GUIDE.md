# Installer Setup Guide

## Quick Start

This guide explains how to set up the build environment for creating Windows and Linux installers.

## Prerequisites

### Windows Installer (Inno Setup)

1. **Install Inno Setup 6:**
   ```bash
   # Windows (using winget)
   winget install JRSoftware.InnoSetup
   
   # Or download from: https://jrsoftware.org/isinfo.php
   ```

2. **Verify Installation:**
   ```bash
   # Should output path to ISCC.exe
   where iscc
   ```

3. **Set Environment Variable (Optional):**
   ```bash
   # If Inno Setup is installed in non-standard location
   set INNO_SETUP_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe
   ```

### Linux Installer (No Additional Tools Required)

The Linux installer is a self-extracting shell script - no additional tools needed!

## Building Installers

### Build Agent Binaries First

```bash
cd local-agent
pnpm install
pnpm build              # Compile TypeScript
pnpm build:binaries     # Create static binaries (Windows + Linux)
```

This creates binaries in `local-agent/dist/binaries/`:
- `local-agent-win-x64.exe` (Windows)
- `local-agent-linux-x64` (Linux)

### Test Installer Generation

The installers are built dynamically when users download them via `/api/agent/download`.

To test locally:

```bash
# Start Next.js dev server
pnpm dev

# In another terminal, test download endpoint
curl -H "Cookie: your-auth-cookie" \
  "http://localhost:3000/api/agent/download?platform=win32" \
  -o OP15-Agent-Setup.exe
```

## Installer Architecture

### Windows Installer

- **Format:** Inno Setup `.exe` installer
- **Location:** `scripts/build-windows-installer.iss`
- **Builder:** `lib/installers/windows.ts`
- **Output:** `installers/OP15-Agent-Setup.exe`
- **Installation Path:** `%LOCALAPPDATA%\OP15\Agent\`
- **Auto-Start:** Windows Task Scheduler (user-level, no admin)

### Linux Installer

- **Format:** Self-extracting shell script
- **Builder:** `lib/installers/linux.ts`
- **Output:** `installers/OP15-Agent-Installer.sh`
- **Installation Path:** `~/.local/share/op15-agent/`
- **Auto-Start:** systemd user service

## Troubleshooting

### Windows Installer Build Fails

**Error:** "Inno Setup compiler (ISCC.exe) not found"

**Solution:**
1. Install Inno Setup 6
2. Add to PATH, OR
3. Set `INNO_SETUP_PATH` environment variable

### Linux Installer Not Executable

**Issue:** Downloaded `.sh` file not executable

**Solution:** The installer script handles this automatically. If double-click doesn't work:
1. Right-click file → Properties → Permissions
2. Check "Allow executing file as program"
3. Double-click again

### Agent Doesn't Auto-Start

**Windows:**
```bash
# Check Task Scheduler
schtasks /query /tn OP15Agent

# Manually start agent
%LOCALAPPDATA%\OP15\Agent\op15-agent.exe --install
```

**Linux:**
```bash
# Check systemd service
systemctl --user status op15-agent

# Manually start agent
~/.local/share/op15-agent/op15-agent --install
```

## Development Workflow

1. **Make Changes:**
   - Edit `local-agent/index.ts` (agent code)
   - Edit `scripts/build-windows-installer.iss` (Windows installer)
   - Edit `lib/installers/linux.ts` (Linux installer script)

2. **Rebuild Binaries:**
   ```bash
   cd local-agent
   pnpm build:binaries
   ```

3. **Test Installer Generation:**
   - Start dev server
   - Test download endpoint
   - Verify installer contains latest binary

4. **Test Installation:**
   - Download installer
   - Run installer on clean VM
   - Verify agent starts and connects

## Production Deployment

### Pre-Build Binaries

Before deploying, ensure binaries are built:

```bash
cd local-agent
pnpm build:binaries
```

Binaries should be committed to repo (or stored in CI/CD artifacts).

### CI/CD Integration (Future)

Add GitHub Actions workflow to:
1. Build binaries on push
2. Store in GitHub Releases
3. Download during installer generation

## File Structure

```
op15/
├── local-agent/
│   ├── dist/
│   │   └── binaries/          # Pre-built binaries (commit these)
│   │       ├── local-agent-win-x64.exe
│   │       └── local-agent-linux-x64
│   └── index.ts               # Agent source code
├── scripts/
│   └── build-windows-installer.iss  # Inno Setup script
├── lib/
│   └── installers/
│       ├── windows.ts         # Windows installer builder
│       └── linux.ts           # Linux installer builder
├── installers/                # Generated installers (gitignored)
│   ├── OP15-Agent-Setup.exe
│   └── OP15-Agent-Installer.sh
└── app/api/agent/download/
    └── route.ts               # Download endpoint
```

## Next Steps

- [ ] Add CI/CD for binary builds
- [ ] Add macOS installer (requires Apple Developer account)
- [ ] Add installer signing (Windows code signing, Linux GPG)
- [ ] Add auto-update mechanism

