/**
 * API route for connecting local environment
 * Spawns user-specific server instance and returns connection details
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logger } from '@/lib/utils/logger';
import { getBridgeManager } from '@/lib/infrastructure/bridge-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      logger.warn('Local env connection: Unauthorized', { hasAuth: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params if it's a Promise (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const routeUserId = resolvedParams.userId;

    logger.info('Local env connection attempt', {
      routeUserId,
      authenticatedUserId,
      match: routeUserId === authenticatedUserId,
    });

    // Verify user ID matches (optional check - we trust Clerk auth)
    // But log mismatch for debugging
    if (routeUserId !== authenticatedUserId) {
      logger.warn('Local env connection: Route userId does not match authenticated userId', {
        routeUserId,
        authenticatedUserId,
      });
      // Still proceed with authenticated user ID for now
      // In production, you might want to return 403 here
    }

    // Use authenticated user ID (most secure)
    const userId = authenticatedUserId;

    logger.info('Local environment connection request', { userId });

    // For now, we'll use the main server URL
    // In production, this would spawn a dedicated server instance per user
    const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                     'http://localhost:3000';

    // Generate connection token
    const token = generateConnectionToken(userId);

    // Check if bridge is already connected
    const bridgeManager = getBridgeManager();
    const isAlreadyConnected = bridgeManager.isConnected(userId);

    logger.info('Local environment connection details', {
      userId,
      serverUrl,
      isAlreadyConnected,
    });

    return NextResponse.json({
      serverUrl,
      token,
      websocketUrl: serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/bridge',
      isConnected: isAlreadyConnected,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Local environment connection error', error instanceof Error ? error : undefined, {
      error: errorMessage,
      stack: errorStack,
    });
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate connection token for user
 * In production, use JWT or similar secure token
 */
function generateConnectionToken(userId: string): string {
  // Simple token generation - replace with proper JWT in production
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${userId}-${timestamp}-${random}`;
}

