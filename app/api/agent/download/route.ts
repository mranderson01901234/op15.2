import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Download endpoint for local agent
 * Serves OS-native installers that copy pre-built binaries and set up services
 * Phase 1: Pre-built binaries + OS-native installers (no Node/pnpm required on user machine)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get platform and user config
    const searchParams = req.nextUrl.searchParams;
    const platform = searchParams.get('platform') || 'linux';
    const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Generate random shared secret (128-bit token)
    const sharedSecret = crypto.randomBytes(16).toString('hex');

    // Determine binary path and installer filename
    let binaryPath: string;
    let filename: string;
    let contentType: string;
    let agentDir: string;
    let binaryName: string;
    
    if (platform === 'win32') {
      binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-win-x64.exe');
      // Fallback to installers directory
      if (!existsSync(binaryPath)) {
        binaryPath = path.join(process.cwd(), 'installers', 'op15-agent-installer-win.exe');
      }
      filename = 'op15-agent-installer.exe';
      contentType = 'application/x-msdownload';
      agentDir = '%LOCALAPPDATA%\\op15-agent';
      binaryName = 'op15-agent.exe';
    } else if (platform === 'darwin') {
      // Try ARM64 first (Apple Silicon), then x64
      binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-macos-arm64');
      if (!existsSync(binaryPath)) {
        binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-macos-x64');
      }
      if (!existsSync(binaryPath)) {
        binaryPath = path.join(process.cwd(), 'installers', 'op15-agent-installer-macos');
      }
      filename = 'op15-agent-installer';
      contentType = 'application/octet-stream';
      agentDir = '$HOME/Library/Application Support/op15-agent';
      binaryName = 'op15-agent';
    } else {
      // Linux
      binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-linux-x64');
      if (!existsSync(binaryPath)) {
        binaryPath = path.join(process.cwd(), 'installers', 'op15-agent-installer-linux');
      }
      filename = 'op15-agent-installer.run';
      contentType = 'application/x-executable';
      agentDir = '$HOME/.op15-agent';
      binaryName = 'op15-agent';
    }
    
    // Check if binary exists
    if (!existsSync(binaryPath)) {
      return NextResponse.json(
        { 
          error: 'Agent binary not available. Binaries must be built first.',
          hint: 'Run: cd local-agent && pnpm build:binaries'
        },
        { status: 404 }
      );
    }

    // Read binary
    const binary = await readFile(binaryPath);
    
    // Generate installer script based on platform
    let installerScript: string;
    
    if (platform === 'win32') {
      installerScript = generateWindowsInstaller(serverUrl, userId, sharedSecret, agentDir, binaryName);
      // For Windows, we'll serve a batch file that extracts and runs the binary
      // Note: Windows installer is more complex - may need to use a proper installer builder
      const response = new NextResponse(installerScript, {
        headers: {
          'Content-Type': 'application/x-msdownload',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      return response;
    } else {
      // Unix (Linux/macOS): Generate shell script with embedded binary
      installerScript = generateUnixInstaller(serverUrl, userId, sharedSecret, agentDir, binaryName, platform);
      
      // Embed binary in installer script
      const scriptBuffer = Buffer.from(installerScript);
      const installer = Buffer.concat([scriptBuffer, binary]);
      
      const response = new NextResponse(installer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      return response;
    }
  } catch (error) {
    console.error('Agent download error:', error);
    return NextResponse.json(
      { error: 'Failed to download agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Generate Windows batch installer script
 */
function generateWindowsInstaller(
  serverUrl: string,
  userId: string,
  sharedSecret: string,
  agentDir: string,
  binaryName: string
): string {
  return `@echo off
REM op15 Agent Installer - Windows
REM This installer sets up the op15 agent as a Windows service

echo 🚀 op15 Local Agent Installer
echo ================================
echo.

set AGENT_DIR=${agentDir}
set BINARY_NAME=${binaryName}
set SERVER_URL=${serverUrl}
set USER_ID=${userId}
set SHARED_SECRET=${sharedSecret}

REM Create agent directory
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"

echo 📦 Installing agent...

REM Extract binary (this script would need to be enhanced to embed binary)
REM For now, we'll assume the binary is downloaded separately
REM TODO: Implement binary embedding for Windows installer

REM Write config.json
echo {> "%AGENT_DIR%\\config.json"
echo   "serverUrl": "${serverUrl}",>> "%AGENT_DIR%\\config.json"
echo   "userId": "${userId}",>> "%AGENT_DIR%\\config.json"
echo   "sharedSecret": "${sharedSecret}",>> "%AGENT_DIR%\\config.json"
echo   "httpPort": 4001>> "%AGENT_DIR%\\config.json"
echo }>> "%AGENT_DIR%\\config.json"

echo ✅ Installation complete!
echo.
echo Agent directory: %AGENT_DIR%
echo.
echo Note: Windows installer needs enhancement to embed binary and set up service.
echo For now, please run the agent manually from %AGENT_DIR%
pause
`;
}

/**
 * Generate Unix (Linux/macOS) installer script with embedded binary
 */
function generateUnixInstaller(
  serverUrl: string,
  userId: string,
  sharedSecret: string,
  agentDir: string,
  binaryName: string,
  platform: string
): string {
  const isLinux = platform === 'linux';
  
  return `#!/bin/bash
# op15 Agent Installer - ${isLinux ? 'Linux' : 'macOS'}
# This installer sets up the op15 agent as a system service
# Binary data is embedded at the end of this script

set -e

echo "🚀 op15 Local Agent Installer"
echo "================================"
echo ""

AGENT_DIR="${agentDir}"
BINARY_NAME="${binaryName}"
SERVER_URL="${serverUrl}"
USER_ID="${userId}"
SHARED_SECRET="${sharedSecret}"

# Create agent directory
mkdir -p "$AGENT_DIR"

echo "📦 Installing agent..."

# Extract binary from end of this script
# Use a simpler method: find marker line, then extract everything after it
BINARY_MARKER="__BINARY_DATA_STARTS_HERE__"
BINARY_PATH="$AGENT_DIR/$BINARY_NAME"

# Method 1: Use Python to extract directly (fastest and most reliable)
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import sys
try:
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    marker = b'$BINARY_MARKER\\n'
    pos = data.find(marker)
    if pos == -1:
        sys.exit(1)
    start_pos = pos + len(marker)
    with open(sys.argv[2], 'wb') as out:
        out.write(data[start_pos:])
except Exception as e:
    sys.exit(1)
" "$0" "$BINARY_PATH" 2>/dev/null
  if [ $? -eq 0 ] && [ -s "$BINARY_PATH" ]; then
    echo "✅ Binary extracted using Python"
  else
    # Clear failed extraction
    rm -f "$BINARY_PATH"
  fi
fi

# Method 2: Fallback - use tail (much faster than dd bs=1)
if [ ! -f "$BINARY_PATH" ] || [ ! -s "$BINARY_PATH" ]; then
  MARKER_POS=""
  
  # Try Python to find position
  if command -v python3 >/dev/null 2>&1; then
    MARKER_POS=$(python3 -c "import sys; data=open(sys.argv[1],'rb').read(); marker=b'$BINARY_MARKER\\n'; pos=data.find(marker); print(pos+len(marker)) if pos!=-1 else sys.exit(1)" "$0" 2>/dev/null)
  fi
  
  # Fallback: use sed to find line, then calculate bytes
  if [ -z "$MARKER_POS" ] || [ "$MARKER_POS" -le 0 ]; then
    MARKER_LINE=$(sed -n "/^$BINARY_MARKER$/=" "$0" 2>/dev/null | head -1)
    if [ -n "$MARKER_LINE" ]; then
      # Count bytes up to and including the marker line
      MARKER_POS=$(head -n "$MARKER_LINE" "$0" 2>/dev/null | wc -c)
      # Add 1 for the newline after marker
      MARKER_POS=$((MARKER_POS + 1))
    fi
  fi
  
  if [ -z "$MARKER_POS" ] || [ "$MARKER_POS" -le 0 ]; then
    echo "❌ Error: Binary marker not found in installer"
    exit 1
  fi
  
  # Extract binary using tail (much faster than dd bs=1)
  # tail -c +N outputs from byte N to end (1-indexed, so +1)
  tail -c +$((MARKER_POS + 1)) "$0" > "$BINARY_PATH" 2>/dev/null
fi

# Verify binary was extracted and has reasonable size (> 1MB)
BINARY_SIZE=$(stat -c%s "$BINARY_PATH" 2>/dev/null || stat -f%z "$BINARY_PATH" 2>/dev/null || echo 0)
if [ ! -s "$BINARY_PATH" ] || [ "$BINARY_SIZE" -lt 1000000 ]; then
  echo "❌ Error: Failed to extract binary (size: $BINARY_SIZE bytes)"
  exit 1
fi

chmod +x "$BINARY_PATH"

# Write config.json
cat > "$AGENT_DIR/config.json" << EOF
{
  "serverUrl": "${serverUrl}",
  "userId": "${userId}",
  "sharedSecret": "${sharedSecret}",
  "httpPort": 4001
}
EOF

echo "✅ Binary installed"

# Set up OS-level service
if command -v systemctl &> /dev/null && [ "$(uname)" = "Linux" ]; then
    echo "🔧 Setting up systemd service..."
    
    mkdir -p "$HOME/.config/systemd/user"
    
    cat > "$HOME/.config/systemd/user/op15-agent.service" << SERVICE_EOF
[Unit]
Description=op15 Local Agent
After=network.target

[Service]
Type=simple
ExecStart=$AGENT_DIR/$BINARY_NAME
Restart=always
RestartSec=10
Environment="SERVER_URL=${serverUrl}"
Environment="USER_ID=${userId}"

[Install]
WantedBy=default.target
SERVICE_EOF
    
    systemctl --user daemon-reload
    systemctl --user enable op15-agent.service
    systemctl --user start op15-agent.service
    
    echo "✅ Agent installed as systemd service"
    echo "To check status: systemctl --user status op15-agent"
elif [ "$(uname)" = "Darwin" ]; then
    echo "🔧 Setting up launchd service..."
    
    mkdir -p "$HOME/Library/LaunchAgents"
    
    cat > "$HOME/Library/LaunchAgents/com.op15.agent.plist" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.op15.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$AGENT_DIR/$BINARY_NAME</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SERVER_URL</key>
        <string>${serverUrl}</string>
        <key>USER_ID</key>
        <string>${userId}</string>
    </dict>
</dict>
</plist>
PLIST_EOF
    
    launchctl load "$HOME/Library/LaunchAgents/com.op15.agent.plist" 2>/dev/null || launchctl load -w "$HOME/Library/LaunchAgents/com.op15.agent.plist"
    echo "✅ Agent installed as launchd service"
else
    echo "⚠️  Could not set up auto-start"
    echo "Starting agent manually..."
    nohup "$AGENT_DIR/$BINARY_NAME" > "$AGENT_DIR/agent.log" 2>&1 &
    echo "✅ Agent started"
fi

echo ""
echo "================================"
echo "✅ Installation complete!"
echo "The agent is now running."
echo ""
echo "Agent directory: $AGENT_DIR"
echo ""
# Exit before binary data to prevent bash from trying to execute it
exit 0
# Binary data marker - everything after this line is the binary
__BINARY_DATA_STARTS_HERE__
`;
}
