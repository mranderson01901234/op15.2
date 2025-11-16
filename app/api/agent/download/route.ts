import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildWindowsInstaller } from '@/lib/installers/windows';
import { buildLinuxInstaller } from '@/lib/installers/linux';

/**
 * Download endpoint for local agent
 * Builds platform-specific installers dynamically with embedded credentials
 * Phase 2: True OS-native installers (Windows .exe, Linux self-extracting .sh)
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
    const platform = searchParams.get('platform') || detectPlatform(req.headers.get('user-agent') || '');
    const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Generate random shared secret (128-bit token)
    const sharedSecret = crypto.randomBytes(16).toString('hex');

    // Store metadata for agent registration (in-memory for now)
    if (!(global as any).agentMetadata) {
      (global as any).agentMetadata = new Map();
    }
    (global as any).agentMetadata.set(userId, {
      sharedSecret,
      platform,
      status: 'pending',
      createdAt: Date.now(),
    });

    // Determine binary path
    let binaryPath: string;
    let installerPath: string;
    let filename: string;
    let contentType: string;
    
    if (platform === 'win32') {
      binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-win-x64.exe');
      if (!existsSync(binaryPath)) {
        const isProduction = process.env.NODE_ENV === 'production';
        return NextResponse.json(
          { 
            error: 'Agent binary not available. Binaries must be built first.',
            hint: isProduction 
              ? 'Binaries should be built during deployment. Please check deployment logs or contact support.'
              : 'Run: cd local-agent && pnpm build:binaries',
            production: isProduction,
            binaryPath: binaryPath
          },
          { status: 404 }
        );
      }

      try {
        // Build Windows installer with Inno Setup
        installerPath = await buildWindowsInstaller({
          userId,
          sharedSecret,
          serverUrl,
          binaryPath,
        });
        filename = 'OP15-Agent-Setup.exe';
        contentType = 'application/vnd.microsoft.portable-executable';
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Windows installer build failed:', errorMessage);
        console.error('Full error:', error);
        
        // Provide more helpful error messages
        let userMessage = 'Installer build failed';
        let hint = 'Inno Setup may not be installed. See lib/installers/windows.ts for setup instructions.';
        
        if (errorMessage.includes('ISCC.exe') || errorMessage.includes('Inno Setup')) {
          userMessage = 'Inno Setup not found in production environment';
          hint = 'Wine and Inno Setup need to be installed in the production environment. Check deployment logs.';
        } else if (errorMessage.includes('not found') || errorMessage.includes('binary')) {
          userMessage = 'Agent binary not available';
          hint = 'Binaries must be built during deployment. Check build logs.';
        } else if (errorMessage.includes('wine') || errorMessage.includes('Wine')) {
          userMessage = 'Wine not available';
          hint = 'Wine needs to be installed in production to build Windows installers.';
        }
        
        return NextResponse.json(
          { 
            error: userMessage,
            details: errorMessage,
            hint: hint,
            platform: 'win32',
            production: process.env.NODE_ENV === 'production'
          },
          { status: 500 }
        );
      }

    } else if (platform === 'linux') {
      binaryPath = path.join(process.cwd(), 'local-agent', 'dist', 'binaries', 'local-agent-linux-x64');
      if (!existsSync(binaryPath)) {
        const isProduction = process.env.NODE_ENV === 'production';
        return NextResponse.json(
          { 
            error: 'Agent binary not available. Binaries must be built first.',
            hint: isProduction 
              ? 'Binaries should be built during deployment. Please check deployment logs or contact support.'
              : 'Run: cd local-agent && pnpm build:binaries',
            production: isProduction,
            binaryPath: binaryPath
          },
          { status: 404 }
        );
      }

      try {
        // Build Linux self-extracting installer
        installerPath = await buildLinuxInstaller({
          userId,
          sharedSecret,
          serverUrl,
          binaryPath,
        });
        // Desktop entry (.desktop), AppImage (.AppImage), or shell script (.sh)
        if (installerPath.endsWith('.desktop')) {
          filename = 'OP15-Agent-Installer.desktop';
          contentType = 'application/x-desktop';
        } else if (installerPath.endsWith('.AppImage')) {
          filename = 'OP15-Agent-Installer.AppImage';
          contentType = 'application/x-executable';
        } else {
          filename = 'OP15-Agent-Installer.sh';
          contentType = 'application/x-sh';
        }
      } catch (error) {
        console.error('Linux installer build failed:', error);
        return NextResponse.json(
          { 
            error: 'Installer build failed',
            details: error instanceof Error ? error.message : String(error)
          },
          { status: 500 }
        );
      }

    } else {
      // macOS deferred
      return NextResponse.json(
        { error: 'macOS installer not yet available. Windows and Linux only.' },
        { status: 400 }
      );
    }

    // Read installer file
    const installerBuffer = await readFile(installerPath);
    
    // Return installer as download
    return new NextResponse(installerBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': installerBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Agent download error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate installer', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

/**
 * Detect platform from User-Agent header
 */
function detectPlatform(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) {
    return 'win32';
  }
  
  if (ua.includes('linux') || ua.includes('x11') || ua.includes('ubuntu') || ua.includes('debian')) {
    return 'linux';
  }
  
  if (ua.includes('mac') || ua.includes('darwin')) {
    return 'darwin';
  }
  
  // Default to Linux (most common for server deployments)
  return 'linux';
}
