import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { execSync, spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

/**
 * Direct agent installation endpoint
 * Installs the agent directly on the user's machine via the Next.js backend
 * NO downloads, NO file manager - pure server-side installation!
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const AGENT_DIR = join(homedir(), '.op15-agent');

    // Step 1: Check prerequisites
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' });
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      if (majorVersion < 20) {
        return NextResponse.json({
          error: `Node.js ${nodeVersion.trim()} is too old. Please install Node.js 20+`,
          step: 'prerequisites'
        }, { status: 400 });
      }
    } catch (err) {
      return NextResponse.json({
        error: 'Node.js is not installed. Please install Node.js 20+ from https://nodejs.org',
        step: 'prerequisites'
      }, { status: 400 });
    }

    // Step 2: Create agent directory
    mkdirSync(AGENT_DIR, { recursive: true });

    // Step 3: Write agent code
    const agentPath = join(process.cwd(), 'local-agent', 'dist', 'index.js');
    
    if (!existsSync(agentPath)) {
      return NextResponse.json({
        error: 'Agent not built. Please run: cd local-agent && pnpm build',
        step: 'agent-files'
      }, { status: 500 });
    }

    const agentCode = readFileSync(agentPath, 'utf8');
    writeFileSync(join(AGENT_DIR, 'agent.js'), agentCode);

    // Step 4: Create launcher script with full node path
    const isWindows = platform() === 'win32';
    
    // Get full path to node executable
    let nodePath = 'node';
    try {
      nodePath = execSync('which node', { encoding: 'utf8' }).trim();
    } catch (err) {
      // Fallback to 'node' in PATH
      nodePath = 'node';
    }
    
    const launcherScript = isWindows
      ? `@echo off\ncd /d "%~dp0"\n"${nodePath}" agent.js "${serverUrl}" "${userId}"`
      : `#!/bin/bash\ncd "$(dirname "$0")"\n"${nodePath}" agent.js "${serverUrl}" "${userId}"`;

    const launcherPath = join(AGENT_DIR, isWindows ? 'start.bat' : 'start.sh');
    writeFileSync(launcherPath, launcherScript);

    // Make executable on Unix
    if (!isWindows) {
      try {
        execSync(`chmod +x "${launcherPath}"`);
        execSync(`chmod +x "${join(AGENT_DIR, 'agent.js')}"`);
      } catch (err) {
        console.warn('Could not set execute permissions');
      }
    }

    // Step 5: Install dependencies
    try {
      execSync('npm install ws@^8.14.2 --no-save --silent', {
        cwd: AGENT_DIR,
        stdio: 'ignore',
        timeout: 60000
      });
    } catch (err) {
      return NextResponse.json({
        error: 'Failed to install dependencies',
        step: 'dependencies',
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 });
    }

    // Step 6: Set up auto-start service
    if (isWindows) {
      // Windows: Startup folder
      const startupDir = join(
        homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'Startup'
      );
      const startupScript = `@echo off\ncd /d "${AGENT_DIR}"\nstart /B "" "${launcherPath}"`;
      
      try {
        mkdirSync(startupDir, { recursive: true });
        writeFileSync(join(startupDir, 'op15-agent.bat'), startupScript);
      } catch (err) {
        console.warn('Could not create startup script');
      }

      // Start agent now
      try {
        spawn(launcherPath, [], { detached: true, stdio: 'ignore', shell: true }).unref();
      } catch (err) {
        console.warn('Could not start agent');
      }

    } else if (platform() === 'linux' && existsSync('/usr/bin/systemctl')) {
      // Linux: User-level systemd (no sudo required)
      const userServiceDir = join(homedir(), '.config', 'systemd', 'user');
      mkdirSync(userServiceDir, { recursive: true });

      const serviceContent = `[Unit]
Description=op15 Local Agent
After=network.target

[Service]
Type=simple
ExecStart=${launcherPath}
Restart=always
RestartSec=10
Environment="SERVER_URL=${serverUrl}"
Environment="USER_ID=${userId}"

[Install]
WantedBy=default.target
`;

      try {
        writeFileSync(join(userServiceDir, 'op15-agent.service'), serviceContent);
        execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
        execSync('systemctl --user enable op15-agent.service', { stdio: 'ignore' });
        execSync('systemctl --user start op15-agent.service', { stdio: 'ignore' });
      } catch (err) {
        // Fallback: Start manually
        try {
          spawn('bash', [launcherPath], { detached: true, stdio: 'ignore' }).unref();
        } catch (startErr) {
          console.error('Could not start agent');
        }
      }

    } else if (platform() === 'darwin') {
      // macOS: launchd
      const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.op15.agent.plist');
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.op15.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${launcherPath}</string>
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
`;

      try {
        mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
        writeFileSync(plistPath, plistContent);
        execSync(`launchctl load "${plistPath}"`, { stdio: 'ignore' });
      } catch (err) {
        // Fallback: Start manually
        try {
          spawn('bash', [launcherPath], { detached: true, stdio: 'ignore' }).unref();
        } catch (startErr) {
          console.error('Could not start agent');
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Agent installed successfully!',
      agentDir: AGENT_DIR,
      userId,
      serverUrl
    });

  } catch (error) {
    console.error('Agent installation error:', error);
    return NextResponse.json({
      error: 'Installation failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
