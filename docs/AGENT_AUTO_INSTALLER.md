# Local Agent Auto-Installer

## Overview

The op15 Local Agent Auto-Installer automatically sets up the local agent for each user, providing full filesystem access without browser restrictions. This is designed for a large user base where manual installation isn't feasible.

## How It Works

### User Flow

1. **User signs in** to the op15 web application
2. **Auto-installer appears** in the sidebar (automatically shown)
3. **User clicks "Install Local Agent"** button
4. **Installer script downloads** (platform-specific: `.sh` for Linux/macOS, `.bat` for Windows)
5. **User runs installer** with their user ID
6. **Agent automatically installs** and starts as a background service
7. **Agent connects** to cloud server via WebSocket
8. **Full filesystem access** is now available

### Architecture

```
Web App (User clicks "Install")
  ↓
/api/agent/download (serves installer script)
  ↓
Installer Script (downloaded to user's machine)
  ↓
Installer runs:
  - Creates ~/.op15-agent directory
  - Downloads/embeds agent code
  - Installs Node.js dependencies
  - Creates system service (systemd/launchd)
  - Starts agent automatically
  ↓
Agent connects to cloud server
  ↓
Full filesystem access enabled
```

## Features

### ✅ Automatic Installation
- One-click download from web app
- Platform detection (Linux, macOS, Windows)
- Automatic dependency installation
- System service creation

### ✅ Background Service
- **Linux**: systemd service (auto-starts on boot)
- **macOS**: launchd service (auto-starts on login)
- **Windows**: Can be configured as Windows service

### ✅ Zero Configuration
- Server URL automatically detected
- User ID passed as parameter
- No manual configuration needed

### ✅ Auto-Reconnection
- Agent automatically reconnects if connection drops
- Service restarts on failure
- Keeps connection alive with ping/pong

## Installation Methods

### Method 1: Web App Auto-Installer (Recommended)

1. Sign in to op15 web app
2. Click "Install Local Agent" in sidebar
3. Download installer script
4. Run installer with your user ID:
   ```bash
   # Linux/macOS
   chmod +x op15-agent-installer.sh
   ./op15-agent-installer.sh user_123abc
   
   # Windows
   op15-agent-installer.bat user_123abc
   ```

### Method 2: Manual Installation

```bash
# Clone/download agent
cd ~/.op15-agent
node agent.js <server-url> <user-id>
```

## Platform Support

| Platform | Installer | Service | Status |
|----------|-----------|---------|--------|
| Linux | ✅ `.sh` | ✅ systemd | Fully Supported |
| macOS | ✅ `.sh` | ✅ launchd | Fully Supported |
| Windows | ✅ `.bat` | ⚠️ Manual | Supported (service setup manual) |

## Service Management

### Linux (systemd)

```bash
# Check status
sudo systemctl status op15-agent

# Start service
sudo systemctl start op15-agent

# Stop service
sudo systemctl stop op15-agent

# Enable auto-start on boot
sudo systemctl enable op15-agent

# View logs
sudo journalctl -u op15-agent -f
```

### macOS (launchd)

```bash
# Check status
launchctl list | grep op15

# Load service
launchctl load ~/Library/LaunchAgents/com.op15.agent.plist

# Unload service
launchctl unload ~/Library/LaunchAgents/com.op15.agent.plist

# View logs
log show --predicate 'process == "op15-agent"' --last 1h
```

### Windows

```batch
REM Start agent
%USERPROFILE%\.op15-agent\start.bat

REM To install as Windows service, use nssm:
nssm install op15-agent "%USERPROFILE%\.op15-agent\start.bat"
nssm start op15-agent
```

## Security

- ✅ **Authentication**: User must be signed in to download installer
- ✅ **User Isolation**: Each user gets their own agent instance
- ✅ **Local Permissions**: Agent runs with user's local permissions
- ✅ **Encrypted Connection**: WebSocket uses wss:// (TLS)
- ✅ **No Remote Code Execution**: Agent only connects to specified server

## Troubleshooting

### Installer Fails to Download

**Problem**: "Failed to download installer"

**Solutions**:
1. Check that `/api/agent/download` endpoint is accessible
2. Verify `local-agent/dist/index.js` exists (build the agent first)
3. Check server logs for errors

### Agent Doesn't Start

**Problem**: Agent installed but not connecting

**Solutions**:
1. Check service status: `sudo systemctl status op15-agent` (Linux)
2. Check logs: `sudo journalctl -u op15-agent -f` (Linux)
3. Verify user ID is correct
4. Check server URL is correct
5. Verify Node.js is installed: `node --version`

### Permission Errors

**Problem**: "Permission denied" when running installer

**Solutions**:
1. Linux/macOS: Run installer with `chmod +x` first
2. Windows: Run as administrator
3. Check file permissions on `~/.op15-agent` directory

### Service Not Starting

**Problem**: Service created but not running

**Solutions**:
1. Check service logs for errors
2. Verify Node.js path is correct
3. Check system service manager (systemd/launchd) status
4. Try running agent manually first: `~/.op15-agent/start.sh`

## API Endpoints

### GET `/api/agent/download`

Downloads platform-specific installer script.

**Query Parameters**:
- `platform` (optional): `linux`, `darwin`, or `win32` (auto-detected if not provided)

**Response**:
- Platform-specific installer script (`.sh` or `.bat`)
- Includes embedded agent code
- Pre-configured with server URL

**Authentication**: Required (Clerk)

## Implementation Details

### Installer Script Generation

The installer script:
1. Creates `~/.op15-agent` directory
2. Embeds agent code from `local-agent/dist/index.js`
3. Creates launcher script (`start.sh` or `start.bat`)
4. Installs Node.js dependencies (`ws` package)
5. Creates system service (systemd/launchd)
6. Starts service automatically

### Agent Code Embedding

Agent code is embedded directly in installer script to avoid:
- Separate download step
- Network issues during installation
- Version mismatches
- Dependency on external CDN

### Service Configuration

Services are configured to:
- Auto-start on boot/login
- Restart on failure
- Run with user permissions
- Log to system logs
- Keep connection alive

## Future Enhancements

- [ ] Electron wrapper for desktop app
- [ ] Browser extension with elevated permissions
- [ ] Auto-update mechanism
- [ ] Multi-user support on same machine
- [ ] GUI installer (not just CLI)
- [ ] Health check endpoint
- [ ] Agent version management
- [ ] Remote agent management dashboard

