import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Get user's filesystem index (cached main directories)
 * This is populated by the agent on first connection
 */

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
    const routeUserId = resolvedParams.userId;

    // Verify user ID matches
    if (routeUserId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get filesystem index from global store (set by server.js when agent connects)
    let filesystemIndex = null;
    if (typeof global !== 'undefined' && (global as any).filesystemIndexes) {
      const indexData = (global as any).filesystemIndexes.get(routeUserId);
      if (indexData) {
        filesystemIndex = {
          mainDirectories: indexData.mainDirectories,
          indexedPaths: Array.from(indexData.indexedPaths),
          indexedAt: indexData.indexedAt,
        };
      }
    }

    return NextResponse.json({
      filesystemIndex,
      hasIndex: filesystemIndex !== null,
    });
  } catch (error) {
    console.error('Failed to get filesystem index:', error);
    return NextResponse.json(
      { error: 'Failed to get filesystem index' },
      { status: 500 }
    );
  }
}

