#!/usr/bin/env node
/**
 * Build installer packages for all platforms
 * Creates platform-specific installers that can auto-execute
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const PLATFORMS = ['win32', 'darwin', 'linux'];
const BUILD_DIR = join(__dirname, '..', 'installers');
const AGENT_DIR = join(__dirname, '..', 'local-agent');

// Ensure build directory exists
if (!existsSync(BUILD_DIR)) {
  mkdirSync(BUILD_DIR, { recursive: true });
}

// Build agent first
console.log('📦 Building agent...');
process.chdir(AGENT_DIR);
execSync('pnpm build', { stdio: 'inherit' });

// Read built agent code
const agentCode = readFileSync(join(AGENT_DIR, 'dist', 'index.js'), 'utf-8');
const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.up.railway.app';

console.log('🔨 Building installers...');

// Build installers for each platform
for (const platform of PLATFORMS) {
  console.log(`\n📦 Building ${platform} installer...`);
  buildInstaller(platform, agentCode, serverUrl);
}

console.log('\n✅ All installers built successfully!');
console.log(`📁 Installers location: ${BUILD_DIR}`);

function buildInstaller(platform, agentCode, serverUrl) {
  const installerScript = createInstallerScript(platform, agentCode, serverUrl);
  const filename = getInstallerFilename(platform);
  const filepath = join(BUILD_DIR, filename);
  
  writeFileSync(filepath, installerScript, 'utf-8');
  
  // Make executable on Unix
  if (platform !== 'win32') {
    execSync(`chmod +x "${filepath}"`);
  }
  
  console.log(`✅ Created: ${filename}`);
}

function getInstallerFilename(platform) {
  switch (platform) {
    case 'win32':
      return 'op15-agent-installer.exe';
    case 'darwin':
      return 'op15-agent-installer.pkg';
    case 'linux':
      return 'op15-agent-installer.deb';
    default:
      return 'op15-agent-installer.sh';
  }
}

function createInstallerScript(platform, agentCode, serverUrl) {
  const escapedCode = agentCode
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
  
  if (platform === 'win32') {
    return createWindowsInstaller(escapedCode, serverUrl);
  } else if (platform === 'darwin') {
    return createMacInstaller(escapedCode, serverUrl);
  } else {
    return createLinuxInstaller(escapedCode, serverUrl);
  }
}

function createWindowsInstaller(agentCode, serverUrl) {
  // For Windows, create a Node.js script that can be executed
  // We'll package this as a .exe using pkg or similar later
  return `#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const SERVER_URL = "${serverUrl}";
const USER_ID = process.argv[2] || process.env.OP15_USER_ID;

if (!USER_ID) {
  console.error('⚠️  User ID required');
  console.error('Usage: op15-agent-installer.exe <your-user-id>');
  process.exit(1);
}

console.log('🚀 op15 Local Agent Installer');
console.log('================================');
console.log('');

const AGENT_DIR = join(homedir(), '.op15-agent');
mkdirSync(AGENT_DIR, { recursive: true });

console.log('📦 Installing agent...');

const agentCode = \`${agentCode}\`;
writeFileSync(join(AGENT_DIR, 'agent.js'), agentCode);

const launcherScript = \`@echo off
cd /d "%~dp0"
node agent.js "\${SERVER_URL}" "\${USER_ID}"
\`;

writeFileSync(join(AGENT_DIR, 'start.bat'), launcherScript);

// Install ws dependency
console.log('📥 Installing dependencies...');
process.chdir(AGENT_DIR);
if (!existsSync(join(AGENT_DIR, 'node_modules'))) {
  execSync('npm install ws@^8.14.2 --no-save --silent', { stdio: 'inherit' });
}

// Create startup script
const startupScript = \`@echo off
cd /d "\${AGENT_DIR}"
start /B "" "\${AGENT_DIR}\\\\start.bat"
\`;

const startupPath = join(homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'op15-agent.bat');
mkdirSync(join(homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), { recursive: true });
writeFileSync(startupPath, startupScript);

// Start agent
console.log('🚀 Starting agent...');
spawn(join(AGENT_DIR, 'start.bat'), [], { detached: true, stdio: 'ignore' }).unref();

console.log('');
console.log('✅ Installation complete!');
console.log('The agent is now running and will automatically connect.');
`;
}

function createMacInstaller(agentCode, serverUrl) {
  return `#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const SERVER_URL = "${serverUrl}";
const USER_ID = process.argv[2] || process.env.OP15_USER_ID;

if (!USER_ID) {
  console.error('⚠️  User ID required');
  console.error('Usage: op15-agent-installer.pkg <your-user-id>');
  process.exit(1);
}

console.log('🚀 op15 Local Agent Installer');
console.log('================================');
console.log('');

const AGENT_DIR = join(homedir(), '.op15-agent');
mkdirSync(AGENT_DIR, { recursive: true });

console.log('📦 Installing agent...');

const agentCode = \`${agentCode}\`;
writeFileSync(join(AGENT_DIR, 'agent.js'), agentCode);

const launcherScript = \`#!/bin/bash
cd "$(dirname "$0")"
node agent.js "\${SERVER_URL}" "\${USER_ID}"
\`;

const launcherPath = join(AGENT_DIR, 'start.sh');
writeFileSync(launcherPath, launcherScript);
execSync(\`chmod +x "\${launcherPath}"\`);

// Install ws dependency
console.log('📥 Installing dependencies...');
process.chdir(AGENT_DIR);
if (!existsSync(join(AGENT_DIR, 'node_modules'))) {
  execSync('npm install ws@^8.14.2 --no-save --silent', { stdio: 'inherit' });
}

// Create launchd plist
const plistContent = \`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.op15.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>\${launcherPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SERVER_URL</key>
    <string>\${SERVER_URL}</string>
    <key>USER_ID</key>
    <string>\${USER_ID}</string>
  </dict>
</dict>
</plist>
\`;

const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.op15.agent.plist');
mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
writeFileSync(plistPath, plistContent);
execSync(\`launchctl load "\${plistPath}"\`);

console.log('');
console.log('✅ Installation complete!');
console.log('The agent is now running and will automatically connect.');
`;
}

function createLinuxInstaller(agentCode, serverUrl) {
  return `#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const SERVER_URL = "${serverUrl}";
const USER_ID = process.argv[2] || process.env.OP15_USER_ID;

if (!USER_ID) {
  console.error('⚠️  User ID required');
  console.error('Usage: op15-agent-installer.deb <your-user-id>');
  process.exit(1);
}

console.log('🚀 op15 Local Agent Installer');
console.log('================================');
console.log('');

const AGENT_DIR = join(homedir(), '.op15-agent');
mkdirSync(AGENT_DIR, { recursive: true });

console.log('📦 Installing agent...');

const agentCode = \`${agentCode}\`;
writeFileSync(join(AGENT_DIR, 'agent.js'), agentCode);

const launcherScript = \`#!/bin/bash
cd "$(dirname "$0")"
node agent.js "\${SERVER_URL}" "\${USER_ID}"
\`;

const launcherPath = join(AGENT_DIR, 'start.sh');
writeFileSync(launcherPath, launcherScript);
execSync(\`chmod +x "\${launcherPath}"\`);

// Install ws dependency
console.log('📥 Installing dependencies...');
process.chdir(AGENT_DIR);
if (!existsSync(join(AGENT_DIR, 'node_modules'))) {
  execSync('npm install ws@^8.14.2 --no-save --silent', { stdio: 'inherit' });
}

// Create user-level systemd service
if (existsSync('/usr/bin/systemctl')) {
  const serviceContent = \`[Unit]
Description=op15 Local Agent
After=network.target

[Service]
Type=simple
User=\${process.env.USER}
ExecStart=\${launcherPath}
Restart=always
RestartSec=10
Environment="SERVER_URL=\${SERVER_URL}"
Environment="USER_ID=\${USER_ID}"

[Install]
WantedBy=default.target
\`;

  const userServiceDir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(userServiceDir, { recursive: true });
  const servicePath = join(userServiceDir, 'op15-agent.service');
  writeFileSync(servicePath, serviceContent);
  
  execSync('systemctl --user daemon-reload');
  execSync('systemctl --user enable op15-agent.service');
  execSync('systemctl --user start op15-agent.service');
  
  console.log('✅ Agent installed as systemd service');
} else {
  // Fallback: Start manually
  spawn('bash', [launcherPath], { detached: true, stdio: 'ignore' }).unref();
  console.log('✅ Agent started');
}

console.log('');
console.log('✅ Installation complete!');
console.log('The agent is now running and will automatically connect.');
`;
}

