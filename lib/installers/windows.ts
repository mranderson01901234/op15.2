/**
 * Windows Installer Builder
 * Uses Inno Setup to create true Windows .exe installer
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface WindowsInstallerConfig {
  userId: string;
  sharedSecret: string;
  serverUrl: string;
  binaryPath: string;
}

/**
 * Build Windows installer using Inno Setup
 * Returns path to built installer
 */
export async function buildWindowsInstaller(
  config: WindowsInstallerConfig
): Promise<string> {
  const scriptDir = path.join(process.cwd(), 'scripts');
  const installerScript = path.join(scriptDir, 'build-windows-installer.iss');
  const outputDir = path.join(process.cwd(), 'installers');
  const outputFile = path.join(outputDir, 'OP15-Agent-Setup.exe');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check if binary exists
  if (!existsSync(config.binaryPath)) {
    throw new Error(`Agent binary not found: ${config.binaryPath}`);
  }

  // Read Inno Setup script template
  let scriptContent = readFileSync(installerScript, 'utf-8');

  // Inject credentials into script
  // Inno Setup uses {#VariableName} syntax for defines
  scriptContent = scriptContent.replace(/{#UserId}/g, config.userId);
  scriptContent = scriptContent.replace(/{#Secret}/g, config.sharedSecret);
  scriptContent = scriptContent.replace(/{#ServerUrl}/g, config.serverUrl);

  // Write modified script to temp file
  const tempScript = path.join(scriptDir, 'build-windows-installer-temp.iss');
  writeFileSync(tempScript, scriptContent);

  try {
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';
    
    // Find Inno Setup compiler
    let isccPath: string | null = null;
    let useWine = false;

    if (isWindows) {
      // Windows: Look for native Inno Setup
      const innoSetupPaths = [
        'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
        'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
        process.env.INNO_SETUP_PATH || '',
      ].filter(Boolean);

      for (const candidate of innoSetupPaths) {
        if (existsSync(candidate)) {
          isccPath = candidate;
          break;
        }
      }

      if (!isccPath) {
        // Try to find via command
        try {
          const { stdout } = await execAsync('where iscc');
          isccPath = stdout.trim();
        } catch {
          // Not found
        }
      }
    } else if (isLinux) {
      // Linux: Try Wine
      const winePaths = [
        process.env.INNO_SETUP_PATH || '',
        `${process.env.HOME}/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe`,
        `${process.env.HOME}/.wine/drive_c/Program Files/Inno Setup 6/ISCC.exe`,
      ].filter(Boolean);

      for (const candidate of winePaths) {
        if (existsSync(candidate)) {
          isccPath = candidate;
          useWine = true;
          break;
        }
      }

      // Check if wine is available
      if (!isccPath) {
        try {
          await execAsync('which wine');
          // Wine is installed, but Inno Setup path not found
          console.warn('⚠️  Wine is installed but Inno Setup path not found.');
          console.warn('   Install Inno Setup via Wine: wine is.exe');
          console.warn('   Or set INNO_SETUP_PATH to Wine path');
        } catch {
          // Wine not installed
        }
      }
    }

    if (!isccPath) {
      throw new Error(
        'Inno Setup compiler (ISCC.exe) not found.\n' +
        (isWindows
          ? 'Please install Inno Setup 6 from https://jrsoftware.org/isinfo.php'
          : isLinux
          ? 'For Linux: Install Wine and Inno Setup:\n' +
            '  1. sudo apt-get install wine\n' +
            '  2. wine is.exe (download from jrsoftware.org)\n' +
            '  3. Set INNO_SETUP_PATH="$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe"'
          : 'Please install Inno Setup 6') +
        '\nOr set INNO_SETUP_PATH environment variable.'
      );
    }

    // Build installer
    console.log(`Building Windows installer with Inno Setup...`);
    if (useWine) {
      console.log(`  Using Wine to run Inno Setup`);
    }
    console.log(`  User ID: ${config.userId}`);
    console.log(`  Server URL: ${config.serverUrl}`);
    console.log(`  Binary: ${config.binaryPath}`);

    // Build installer
    if (useWine) {
      // Use winepath to convert Linux paths to Wine Windows paths
      let wineScriptPath: string;
      let wineScriptDir: string;
      try {
        wineScriptPath = execSync(`winepath -w "${tempScript}"`, { encoding: 'utf8' }).trim();
        wineScriptDir = execSync(`winepath -w "${scriptDir}"`, { encoding: 'utf8' }).trim();
      } catch {
        // Fallback: Wine typically uses Z: drive
        wineScriptPath = tempScript.replace(/^\/home\//, 'Z:\\home\\').replace(/\//g, '\\');
        wineScriptDir = scriptDir.replace(/^\/home\//, 'Z:\\home\\').replace(/\//g, '\\');
      }
      
      execSync(`wine "${isccPath}" "${wineScriptPath}"`, {
        stdio: 'inherit',
        cwd: scriptDir, // Keep Linux path for cwd
      });
    } else {
      execSync(`"${isccPath}" "${tempScript}"`, {
        stdio: 'inherit',
        cwd: scriptDir,
      });
    }

    // Verify output file exists
    if (!existsSync(outputFile)) {
      throw new Error(`Installer build failed: ${outputFile} not found`);
    }

    console.log(`✅ Windows installer built: ${outputFile}`);
    return outputFile;
  } finally {
    // Clean up temp script
    if (existsSync(tempScript)) {
      try {
        require('fs').unlinkSync(tempScript);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Check if Inno Setup is available
 */
export function checkInnoSetupAvailable(): boolean {
  const innoSetupPaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    process.env.INNO_SETUP_PATH || '',
  ].filter(Boolean);

  return innoSetupPaths.some((p) => existsSync(p));
}

