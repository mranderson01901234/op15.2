import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { RestrictionLevel } from '@/lib/types/user-context';

/**
 * Get or set user workspace configuration
 * GET: Retrieve user's workspace root and restriction level
 * POST: Set user's workspace root and restriction level
 */

// In-memory store (in production, use database)
const userWorkspaceConfig = new Map<string, {
  workspaceRoot: string;
  restrictionLevel: RestrictionLevel;
  userHomeDirectory?: string;
}>();

// Get user home directory from agent metadata if available
function getUserHomeDirectory(userId: string): string | undefined {
  // Check global agent metadata (set by server.js when agent connects)
  if (typeof global !== 'undefined' && (global as any).agentMetadata) {
    const metadata = (global as any).agentMetadata.get(userId);
    if (metadata?.homeDirectory) {
      return metadata.homeDirectory;
    }
  }
  return process.env.HOME || process.env.USERPROFILE;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params if it's a Promise (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params;

    // Verify user ID matches
    if (resolvedParams.userId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const config = userWorkspaceConfig.get(resolvedParams.userId);
    // Always get fresh home directory from agent (each user has different home)
    const userHomeDirectory = getUserHomeDirectory(resolvedParams.userId);
    
    if (!config) {
      // Default: unrestricted access to filesystem root (universal for all users)
      return NextResponse.json({
        workspaceRoot: '/',
        restrictionLevel: 'unrestricted' as RestrictionLevel,
        userHomeDirectory: userHomeDirectory, // User-specific home directory from agent
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // Always use fresh home directory from agent (don't cache it)
    return NextResponse.json({
      ...config,
      userHomeDirectory: userHomeDirectory, // Always get latest from agent
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to get workspace config:', error);
    return NextResponse.json(
      { error: 'Failed to get workspace configuration' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params if it's a Promise (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params;

    // Verify user ID matches
    if (resolvedParams.userId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { workspaceRoot, restrictionLevel, userHomeDirectory } = body;

    // Validate restriction level
    const validLevels: RestrictionLevel[] = ['unrestricted', 'home', 'custom'];
    if (restrictionLevel && !validLevels.includes(restrictionLevel)) {
      return NextResponse.json(
        { error: `Invalid restriction level. Must be one of: ${validLevels.join(', ')}` },
        { status: 400 }
      );
    }

    // Get user home directory from agent (each user has different home)
    const detectedHomeDirectory = getUserHomeDirectory(resolvedParams.userId) || userHomeDirectory;
    
    // Determine workspace root based on restriction level
    // Default is '/' (filesystem root) - universal for all users
    let finalWorkspaceRoot = '/';
    
    if (restrictionLevel === 'home') {
      // Restrict to user's home directory (user-specific)
      finalWorkspaceRoot = detectedHomeDirectory || '/home/user';
    } else if (restrictionLevel === 'unrestricted') {
      // Full filesystem access - universal root
      finalWorkspaceRoot = '/';
    } else if (restrictionLevel === 'custom' && workspaceRoot) {
      // User-selected custom directory
      finalWorkspaceRoot = workspaceRoot;
    }

    // Store configuration
    // Note: userHomeDirectory is NOT stored - it's fetched fresh from agent each time
    // because each user has a different home directory
    const finalRestrictionLevel = restrictionLevel || 'unrestricted';
    userWorkspaceConfig.set(resolvedParams.userId, {
      workspaceRoot: finalWorkspaceRoot,
      restrictionLevel: finalRestrictionLevel,
      // Don't store userHomeDirectory - always fetch from agent
    });

    console.log('Workspace config saved', {
      userId: resolvedParams.userId,
      workspaceRoot: finalWorkspaceRoot,
      restrictionLevel: finalRestrictionLevel,
      detectedHomeDirectory,
    });

    return NextResponse.json({
      success: true,
      workspaceRoot: finalWorkspaceRoot,
      restrictionLevel: finalRestrictionLevel,
      userHomeDirectory: detectedHomeDirectory, // User-specific home from agent
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to set workspace config:', error);
    return NextResponse.json(
      { error: 'Failed to set workspace configuration' },
      { status: 500 }
    );
  }
}

