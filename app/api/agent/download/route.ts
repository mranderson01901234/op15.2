import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Download endpoint for local agent
 * Serves the compiled agent binary/script to users
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get platform from query params
    const searchParams = req.nextUrl.searchParams;
    const platform = searchParams.get('platform') || 'linux'; // linux, darwin, win32

    // Path to the compiled agent
    const agentPath = path.join(process.cwd(), 'local-agent', 'dist', 'index.js');
    
    try {
      const agentCode = await readFile(agentPath, 'utf-8');
      
      // Get user ID from header or query params (for auto-download)
      const userHeader = req.headers.get('X-User-Id');
      const userQuery = searchParams.get('userId');
      const userAgentId = userHeader || userQuery || userId; // Use authenticated userId as fallback
      
      // Create installer script that includes the agent code and user ID
      const installerScript = createInstallerScript(agentCode, platform, userAgentId);
      
      const filename = platform === 'win32' 
        ? 'op15-agent-installer.bat' 
        : 'op15-agent-installer.sh';
      
      return new NextResponse(installerScript, {
        headers: {
          'Content-Type': platform === 'win32' ? 'text/plain' : 'text/x-sh',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      console.error('Failed to read agent file:', error);
      return NextResponse.json(
        { error: 'Agent not available. Please build the agent first.' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Agent download error:', error);
    return NextResponse.json(
      { error: 'Failed to download agent' },
      { status: 500 }
    );
  }
}

function createInstallerScript(agentCode: string, platform: string, userId?: string): string {
  if (platform === 'win32') {
    return createWindowsInstaller(agentCode, userId);
  } else {
    return createUnixInstaller(agentCode, userId);
  }
}

function createUnixInstaller(agentCode: string, userId?: string): string {
  // Base64 encode the agent code to avoid shell escaping issues
  const agentCodeBase64 = Buffer.from(agentCode).toString('base64');
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.up.railway.app';
  const preconfiguredUserId = userId || '';
  
  return `#!/bin/bash
# op15 Local Agent Auto-Installer
# This script automatically installs and runs the op15 local agent
# Pre-configured with server URL${preconfiguredUserId ? ' and user ID' : ''}

set -e

echo "🚀 op15 Local Agent Installer"
echo "================================"
echo ""

# Get server URL (pre-configured) and user ID
SERVER_URL="${serverUrl}"
USER_ID="${preconfiguredUserId || '$1'}"

# If no user ID provided, try to get from environment or prompt
if [ -z "$USER_ID" ]; then
  if [ -n "$OP15_USER_ID" ]; then
    USER_ID="$OP15_USER_ID"
  else
    echo "⚠️  User ID required"
    echo ""
    echo "Please provide your user ID:"
    echo "  $0 <your-user-id>"
    echo ""
    echo "Or set environment variable:"
    echo "  export OP15_USER_ID=user_xxxxx"
    echo "  $0"
    echo ""
    read -p "Enter your user ID (or press Ctrl+C to cancel): " USER_ID
    if [ -z "$USER_ID" ]; then
      echo "❌ User ID is required"
      exit 1
    fi
  fi
fi

# Create agent directory
AGENT_DIR="$HOME/.op15-agent"
mkdir -p "$AGENT_DIR"

# Write agent code (base64 decoded)
cat > "$AGENT_DIR/agent.js" << 'AGENT_EOF'
${agentCode}
AGENT_EOF

# Create launcher script
cat > "$AGENT_DIR/start.sh" << 'LAUNCHER_EOF'
#!/bin/bash
cd "$(dirname "$0")"
node agent.js "$SERVER_URL" "$USER_ID"
LAUNCHER_EOF

chmod +x "$AGENT_DIR/start.sh"
chmod +x "$AGENT_DIR/agent.js"

# Install Node.js dependencies if needed
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js 20+ first."
  exit 1
fi

# Install ws package
cd "$AGENT_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install ws@^8.14.2 --no-save --silent
fi

# Create systemd service (Linux) or launchd plist (macOS)
if command -v systemctl &> /dev/null; then
  # Linux systemd service
  echo "Creating systemd service..."
  sudo tee /etc/systemd/system/op15-agent.service > /dev/null << EOF
[Unit]
Description=op15 Local Agent
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$AGENT_DIR/start.sh
Restart=always
RestartSec=10
Environment="SERVER_URL=$SERVER_URL"
Environment="USER_ID=$USER_ID"

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable op15-agent.service
  sudo systemctl start op15-agent.service
  echo "✅ Agent installed as systemd service"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS launchd
  echo "Creating launchd service..."
  PLIST_PATH="$HOME/Library/LaunchAgents/com.op15.agent.plist"
  cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.op15.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$AGENT_DIR/start.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SERVER_URL</key>
    <string>$SERVER_URL</string>
    <key>USER_ID</key>
    <string>$USER_ID</string>
  </dict>
</dict>
</plist>
EOF
  launchctl load "$PLIST_PATH"
  echo "✅ Agent installed as launchd service"
else
  echo "⚠️  Could not create system service. Running agent manually..."
  echo "To start the agent, run: $AGENT_DIR/start.sh"
fi

echo ""
echo "✅ Installation complete!"
echo "The agent is now running and will automatically connect to your op15 server."
echo ""
echo "Your user ID: $USER_ID"
echo "Server URL: $SERVER_URL"
echo ""
echo "To check status:"
if command -v systemctl &> /dev/null; then
  echo "  sudo systemctl status op15-agent"
  echo "  sudo journalctl -u op15-agent -f"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  echo "  launchctl list | grep op15"
  echo "  log show --predicate 'process == \"op15-agent\"' --last 1h"
fi
echo ""
echo "The agent will automatically start on system boot/login."
`;
}

function createWindowsInstaller(agentCode: string, userId?: string): string {
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.up.railway.app';
  const preconfiguredUserId = userId || '';
  
  // Escape for Windows batch file
  const escapedCode = agentCode
    .replace(/%/g, '%%')
    .replace(/</g, '^<')
    .replace(/>/g, '^>')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|');
  
  return `@echo off
REM op15 Local Agent Auto-Installer for Windows
REM This script automatically installs and runs the op15 local agent
REM Pre-configured with server URL${preconfiguredUserId ? ' and user ID' : ''}

echo 🚀 op15 Local Agent Installer
echo ================================
echo.

REM Get server URL and user ID
set SERVER_URL=${serverUrl}
set USER_ID=${preconfiguredUserId ? preconfiguredUserId : '%1'}

REM If no user ID provided, try to get from environment or prompt
if "%USER_ID%"=="" (
  if not "%OP15_USER_ID%"=="" (
    set USER_ID=%OP15_USER_ID%
  ) else (
    echo ⚠️  User ID required
    echo.
    echo Please provide your user ID:
    echo   %0 ^<your-user-id^>
    echo.
    echo Or set environment variable:
    echo   set OP15_USER_ID=user_xxxxx
    echo   %0
    echo.
    set /p USER_ID="Enter your user ID (or press Ctrl+C to cancel): "
    if "%USER_ID%"=="" (
      echo ❌ User ID is required
      exit /b 1
    )
  )
)

REM Create agent directory
set AGENT_DIR=%USERPROFILE%\.op15-agent
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"

REM Write agent code
(
${escapedCode.split('\n').map(line => `echo ${line}`).join('\r\n')}
) > "%AGENT_DIR%\\agent.js"

REM Create launcher script
(
echo @echo off
echo cd /d "%%~dp0"
echo node agent.js "%SERVER_URL%" "%USER_ID%"
) > "%AGENT_DIR%\\start.bat"

REM Install Node.js dependencies if needed
where node >nul 2>nul
if errorlevel 1 (
  echo ❌ Node.js is not installed. Please install Node.js 20+ first.
  exit /b 1
)

REM Install ws package
cd /d "%AGENT_DIR%"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install ws@^8.14.2 --no-save --silent
)

REM Create Windows service using node-windows or nssm
echo ✅ Installation complete!
echo The agent is now ready to run.
echo.
echo To start the agent, run: %AGENT_DIR%\\start.bat
echo.
echo To install as Windows service, use nssm or node-windows.
`;
}

