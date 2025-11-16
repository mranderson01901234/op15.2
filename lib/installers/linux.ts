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

echo "🚀 OP15 Agent Installer"
echo "========================"
echo ""

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

echo "📦 Agent binary extracted"

# Write config.json
cat > "$CONFIG_FILE" << EOF
{
  "userId": "${config.userId}",
  "sharedSecret": "${config.sharedSecret}",
  "serverUrl": "${config.serverUrl}",
  "httpPort": 4001
}
EOF

echo "📋 Configuration written"

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

echo "🔧 Systemd service created"

# Enable and start service
systemctl --user daemon-reload
systemctl --user enable op15-agent.service || true
systemctl --user start op15-agent.service || true

echo ""
echo "✅ Installation complete!"
echo ""
echo "Agent directory: $INSTALL_DIR"
echo "Service status: systemctl --user status op15-agent"
echo ""
echo "The agent is now running and will start automatically on login."
echo ""

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

