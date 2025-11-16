/**
 * Linux Installer Builder
 * Creates self-extracting installer that packages AppImage
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface LinuxInstallerConfig {
  userId: string;
  sharedSecret: string;
  serverUrl: string;
  binaryPath: string;
}

/**
 * Build Linux installer (AppImage for true double-click)
 * Returns AppImage directly - users make it executable via GUI, then double-click
 */
export async function buildLinuxInstaller(
  config: LinuxInstallerConfig
): Promise<string> {
  // Build AppImage - serve it directly
  try {
    return await buildLinuxAppImage(config);
  } catch (error) {
    console.warn('⚠️  AppImage build failed, falling back to shell script installer:', error instanceof Error ? error.message : String(error));
    return await buildLinuxShellInstaller(config);
  }
}

/**
 * Build Linux self-extracting shell script installer (fallback)
 * Creates a shell script that extracts and installs the agent
 */
async function buildLinuxShellInstaller(
  config: LinuxInstallerConfig
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'installers');
  const outputFile = path.join(outputDir, 'OP15-Agent-Installer.sh');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check if binary exists
  if (!existsSync(config.binaryPath)) {
    throw new Error(`Agent binary not found: ${config.binaryPath}`);
  }

  // Read binary as buffer
  const binaryBuffer = readFileSync(config.binaryPath);

  // Create self-extracting installer script
  const installerScript = `#!/bin/bash
# OP15 Agent Self-Extracting Installer
# This script extracts the agent binary and installs it

set -e

# Detect if running from file manager (no TTY) and use GUI dialogs
USE_GUI=false
if [ ! -t 0 ]; then
  USE_GUI=true
  # Check for GUI dialog tools
  if command -v zenity >/dev/null 2>&1; then
    DIALOG_TOOL="zenity"
  elif command -v kdialog >/dev/null 2>&1; then
    DIALOG_TOOL="kdialog"
  else
    USE_GUI=false
  fi
fi

# Show message function
show_message() {
  if [ "$USE_GUI" = true ] && [ -n "$DIALOG_TOOL" ]; then
    if [ "$DIALOG_TOOL" = "zenity" ]; then
      zenity --info --text="$1" --title="OP15 Agent Installer" 2>/dev/null || echo "$1"
    elif [ "$DIALOG_TOOL" = "kdialog" ]; then
      kdialog --msgbox "$1" --title "OP15 Agent Installer" 2>/dev/null || echo "$1"
    fi
  else
    echo "$1"
  fi
}

# Show progress function
show_progress() {
  if [ "$USE_GUI" = true ] && [ "$DIALOG_TOOL" = "zenity" ]; then
    echo "$1" | zenity --progress --pulsate --text="$1" --title="OP15 Agent Installer" --auto-close 2>/dev/null &
    PROGRESS_PID=$!
  else
    echo "$1"
  fi
}

show_message "🚀 OP15 Agent Installer\\n\\nStarting installation..."

# Installation directory
INSTALL_DIR="$HOME/.local/share/op15-agent"
CONFIG_FILE="$INSTALL_DIR/config.json"
BINARY_PATH="$INSTALL_DIR/op15-agent"
SERVICE_FILE="$HOME/.config/systemd/user/op15-agent.service"

# Ensure we're in a writable location
if [ ! -w "$HOME" ]; then
  echo "❌ Error: Cannot write to home directory"
  exit 1
fi

# Create installation directory
mkdir -p "$INSTALL_DIR"

show_progress "📦 Extracting agent binary..."

# Extract binary from this script
# Binary data starts after this line
ARCHIVE_START=$(awk '/^__ARCHIVE_BELOW__/ {print NR + 1; exit 0; }' "$0")
tail -n+$ARCHIVE_START "$0" > "$BINARY_PATH"
chmod +x "$BINARY_PATH"

show_progress "📋 Writing configuration..."

# Write config.json
cat > "$CONFIG_FILE" << EOF
{
  "userId": "${config.userId}",
  "sharedSecret": "${config.sharedSecret}",
  "serverUrl": "${config.serverUrl}",
  "httpPort": 4001
}
EOF

show_progress "🔧 Creating system service..."

# Create systemd user service
mkdir -p "$HOME/.config/systemd/user"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=OP15 Local Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/op15-agent
Restart=always
RestartSec=10
Environment="SERVER_URL=${config.serverUrl}"
Environment="USER_ID=${config.userId}"

[Install]
WantedBy=default.target
EOF

show_progress "🚀 Starting agent..."

# Enable and start service
systemctl --user daemon-reload
systemctl --user enable op15-agent.service || true
systemctl --user start op15-agent.service || true

# Close progress dialog if open
if [ -n "$PROGRESS_PID" ]; then
  kill $PROGRESS_PID 2>/dev/null || true
fi

show_message "✅ Installation Complete!\\n\\nThe OP15 agent is now installed and running.\\n\\nIt will start automatically when you log in.\\n\\nYou can close this window."

# Exit before binary data
exit 0

__ARCHIVE_BELOW__
`;

  // Combine script + binary
  const scriptBuffer = Buffer.from(installerScript, 'utf-8');
  const installerBuffer = Buffer.concat([scriptBuffer, binaryBuffer]);

  // Write installer file
  writeFileSync(outputFile, installerBuffer);
  chmodSync(outputFile, 0o755); // Make executable

  console.log(`✅ Linux installer built: ${outputFile}`);
  console.log(`  Size: ${(installerBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  return outputFile;
}

/**
 * Build Linux AppImage installer
 * Creates a true double-click executable AppImage
 */
export async function buildLinuxAppImage(
  config: LinuxInstallerConfig
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'installers');
  const outputFile = path.join(outputDir, 'OP15-Agent-Installer.AppImage');
  const appDir = path.join(outputDir, 'AppDir');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check if binary exists
  if (!existsSync(config.binaryPath)) {
    throw new Error(`Agent binary not found: ${config.binaryPath}`);
  }

  // Check for appimagetool
  let appimagetoolPath: string | null = null;
  const possiblePaths = [
    process.env.APPIMAGETOOL_PATH,
    path.join(process.cwd(), 'tools', 'appimagetool-x86_64.AppImage'),
    '/usr/local/bin/appimagetool',
    '/usr/bin/appimagetool',
  ].filter(Boolean) as string[];

  for (const toolPath of possiblePaths) {
    if (existsSync(toolPath)) {
      appimagetoolPath = toolPath;
      break;
    }
  }

  // Try to find appimagetool in PATH
  if (!appimagetoolPath) {
    try {
      const whichResult = execSync('which appimagetool', { encoding: 'utf8' }).trim();
      if (whichResult) {
        appimagetoolPath = whichResult;
      }
    } catch {
      // Not in PATH
    }
  }

  if (!appimagetoolPath) {
    // Download appimagetool if not found
    console.log('📥 Downloading appimagetool...');
    const toolsDir = path.join(process.cwd(), 'tools');
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
    }
    
    appimagetoolPath = path.join(toolsDir, 'appimagetool-x86_64.AppImage');
    
    if (!existsSync(appimagetoolPath)) {
      try {
        execSync(
          `wget -q https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -O "${appimagetoolPath}"`,
          { stdio: 'inherit' }
        );
        chmodSync(appimagetoolPath, 0o755);
        console.log('✅ appimagetool downloaded');
      } catch (error) {
        throw new Error(
          `appimagetool not found and download failed. Please install appimagetool:\n` +
          `  wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage\n` +
          `  chmod +x appimagetool-x86_64.AppImage\n` +
          `  sudo mv appimagetool-x86_64.AppImage /usr/local/bin/appimagetool\n` +
          `Or set APPIMAGETOOL_PATH environment variable.`
        );
      }
    }
  }

  // Clean up old AppDir if exists
  if (existsSync(appDir)) {
    execSync(`rm -rf "${appDir}"`);
  }
  mkdirSync(appDir, { recursive: true });

  // Create AppDir structure
  const usrBinDir = path.join(appDir, 'usr', 'bin');
  const usrShareAppsDir = path.join(appDir, 'usr', 'share', 'applications');
  const usrShareIconsDir = path.join(appDir, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps');
  
  mkdirSync(usrBinDir, { recursive: true });
  mkdirSync(usrShareAppsDir, { recursive: true });
  mkdirSync(usrShareIconsDir, { recursive: true });

  // Copy agent binary
  const agentBinaryDest = path.join(usrBinDir, 'op15-agent');
  execSync(`cp "${config.binaryPath}" "${agentBinaryDest}"`);
  chmodSync(agentBinaryDest, 0o755);

  // Create AppRun script (installer logic)
  // Note: Variables are substituted at build time in TypeScript
  const appRunScript = `#!/bin/bash
set -e

# Installation directory
INSTALL_DIR="$HOME/.local/share/op15-agent"
CONFIG_FILE="$INSTALL_DIR/config.json"
BINARY_PATH="$INSTALL_DIR/op15-agent"
SERVICE_FILE="$HOME/.config/systemd/user/op15-agent.service"

# Config values (injected at build time)
USER_ID="${config.userId}"
SHARED_SECRET="${config.sharedSecret}"
SERVER_URL="${config.serverUrl}"

# Detect GUI and use dialogs
USE_GUI=false
if [ ! -t 0 ]; then
  USE_GUI=true
  if command -v zenity >/dev/null 2>&1; then
    DIALOG_TOOL="zenity"
  elif command -v kdialog >/dev/null 2>&1; then
    DIALOG_TOOL="kdialog"
  else
    USE_GUI=false
  fi
fi

show_message() {
  if [ "$USE_GUI" = true ] && [ -n "$DIALOG_TOOL" ]; then
    if [ "$DIALOG_TOOL" = "zenity" ]; then
      zenity --info --text="$1" --title="OP15 Agent Installer" 2>/dev/null || echo "$1"
    elif [ "$DIALOG_TOOL" = "kdialog" ]; then
      kdialog --msgbox "$1" --title "OP15 Agent Installer" 2>/dev/null || echo "$1"
    fi
  else
    echo "$1"
  fi
}

show_progress() {
  if [ "$USE_GUI" = true ] && [ "$DIALOG_TOOL" = "zenity" ]; then
    echo "$1" | zenity --progress --pulsate --text="$1" --title="OP15 Agent Installer" --auto-close 2>/dev/null &
    PROGRESS_PID=$!
  else
    echo "$1"
  fi
}

show_message "🚀 OP15 Agent Installer\\n\\nStarting installation..."

# Create installation directory
mkdir -p "$INSTALL_DIR"

show_progress "📦 Installing agent binary..."

# Copy binary from AppImage
cp "$APPDIR/usr/bin/op15-agent" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

show_progress "📋 Writing configuration..."

# Write config.json
cat > "$CONFIG_FILE" << EOF
{
  "userId": "$USER_ID",
  "sharedSecret": "$SHARED_SECRET",
  "serverUrl": "$SERVER_URL",
  "httpPort": 4001
}
EOF

show_progress "🔧 Creating system service..."

# Create systemd user service
mkdir -p "$HOME/.config/systemd/user"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=OP15 Local Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/op15-agent
Restart=always
RestartSec=10
Environment="SERVER_URL=$SERVER_URL"
Environment="USER_ID=$USER_ID"

[Install]
WantedBy=default.target
EOF

show_progress "🚀 Starting agent..."

# Enable and start service
systemctl --user daemon-reload
systemctl --user enable op15-agent.service || true
systemctl --user start op15-agent.service || true

# Close progress dialog if open
if [ -n "$PROGRESS_PID" ]; then
  kill $PROGRESS_PID 2>/dev/null || true
fi

show_message "✅ Installation Complete!\\n\\nThe OP15 agent is now installed and running.\\n\\nIt will start automatically when you log in.\\n\\nYou can close this window."

exit 0
`;

  // Write AppRun
  const appRunPath = path.join(appDir, 'AppRun');
  writeFileSync(appRunPath, appRunScript);
  chmodSync(appRunPath, 0o755);

  // Create .desktop file
  const desktopFile = `[Desktop Entry]
Name=OP15 Agent Installer
Comment=Install OP15 Local Agent
Exec=op15-agent-installer
Icon=op15-agent
Type=Application
Categories=Utility;
Terminal=false
`;
  writeFileSync(path.join(usrShareAppsDir, 'op15-agent-installer.desktop'), desktopFile);

  // Create AppImage
  console.log('🔨 Building AppImage...');
  execSync(`"${appimagetoolPath}" "${appDir}" "${outputFile}"`, {
    stdio: 'inherit',
    cwd: outputDir,
  });

  // Make AppImage executable
  chmodSync(outputFile, 0o755);

  // Clean up AppDir
  execSync(`rm -rf "${appDir}"`);

  console.log(`✅ AppImage built: ${outputFile}`);
  const stats = require('fs').statSync(outputFile);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return outputFile;
}

/**
 * Build desktop entry launcher for AppImage
 * Creates a .desktop file that file managers will execute when double-clicked
 */
async function buildDesktopEntryLauncher(
  config: LinuxInstallerConfig,
  appImagePath: string
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'installers');
  const outputFile = path.join(outputDir, 'OP15-Agent-Installer.desktop');

  // Read AppImage to embed it
  const appImageBuffer = readFileSync(appImagePath);
  const appImageBase64 = appImageBuffer.toString('base64');

  // Create desktop entry that extracts and runs AppImage
  // File managers recognize .desktop files and will execute the Exec= line
  const desktopContent = `[Desktop Entry]
Version=1.0
Name=OP15 Agent Installer
Comment=Install OP15 Local Agent
Exec=bash -c 'cd "$(dirname "%k")" && APPIMAGE="$HOME/Downloads/OP15-Agent-Installer.AppImage" && if [ ! -f "$APPIMAGE" ] || [ ! -x "$APPIMAGE" ]; then echo "${appImageBase64}" | base64 -d > "$APPIMAGE" && chmod +x "$APPIMAGE"; fi && "$APPIMAGE"'
Icon=application-x-executable
Type=Application
Categories=Utility;
Terminal=false
MimeType=application/x-desktop;
`;

  writeFileSync(outputFile, desktopContent);
  chmodSync(outputFile, 0o755);

  console.log(`✅ Desktop entry launcher built: ${outputFile}`);
  return outputFile;
}

