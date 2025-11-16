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
 * Build Linux self-extracting installer
 * Creates a shell script that extracts and runs the AppImage
 */
export async function buildLinuxInstaller(
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

# Extract binary from this script
# Binary data starts after this line
ARCHIVE_START=$(awk '/^__ARCHIVE_BELOW__/ {print NR + 1; exit 0; }' "$0")
tail -n+$ARCHIVE_START "$0" > "$BINARY_PATH"
chmod +x "$BINARY_PATH"

show_progress "📦 Extracting agent binary..."

# Extract binary from this script
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
 * Build AppImage (alternative approach - not used in current implementation)
 * This is kept for reference if we want to switch to AppImage format later
 */
export async function buildLinuxAppImage(
  config: LinuxInstallerConfig
): Promise<string> {
  // This would require AppImageKit tools
  // For now, we use self-extracting installer instead
  throw new Error('AppImage build not implemented. Use buildLinuxInstaller instead.');
}

