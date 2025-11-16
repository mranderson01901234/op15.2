import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getConnectionStatus } from '@/lib/infrastructure/connection-status';

/**
 * API endpoint to check actual agent connection status
 * Returns ConnectionStatus enum ("none" | "http-only" | "full")
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

    // Verify user ID matches
    if (resolvedParams.userId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = resolvedParams.userId;
    
    // Get connection status using the new enum-based system
    const connectionInfo = await getConnectionStatus(userId);

    return NextResponse.json({
      status: connectionInfo.status, // "none" | "http-only" | "full"
      httpPort: connectionInfo.httpPort,
      httpHealth: connectionInfo.httpHealth,
      lastHealthCheck: connectionInfo.lastHealthCheck,
      metadata: connectionInfo.metadata,
      // Legacy fields for backward compatibility (deprecated)
      connected: connectionInfo.status !== "none",
      websocketConnected: connectionInfo.status === "full",
      hasMetadata: !!connectionInfo.metadata,
      httpApiAvailable: connectionInfo.httpHealth === "healthy",
      hasPermissions: connectionInfo.metadata?.hasPermissions || false,
      mode: connectionInfo.metadata?.mode || null,
      userHomeDirectory: connectionInfo.metadata?.homeDirectory,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to check agent status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check agent status',
        status: "none" as const,
        httpHealth: "unknown" as const,
        lastHealthCheck: Date.now(),
        // Legacy fields
        connected: false,
        websocketConnected: false,
        hasMetadata: false,
      },
      { status: 500 }
    );
  }
}

