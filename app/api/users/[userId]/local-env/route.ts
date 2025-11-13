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

    // Determine server URL from environment variables or request headers
    // Priority: NEXT_PUBLIC_APP_URL > RAILWAY_PUBLIC_DOMAIN > VERCEL_URL > request host
    let serverUrl: string;
    
    if (process.env.NEXT_PUBLIC_APP_URL) {
      serverUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      // Railway provides RAILWAY_PUBLIC_DOMAIN (e.g., "op152-production.up.railway.app")
      serverUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    } else if (process.env.VERCEL_URL) {
      serverUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      // Fallback to request host (works in most deployments)
      const protocol = req.headers.get('x-forwarded-proto') || 'https';
      const host = req.headers.get('host') || 'localhost:3000';
      serverUrl = `${protocol}://${host}`;
    }
    
    // Ensure URL doesn't have trailing slash
    serverUrl = serverUrl.replace(/\/$/, '');
    
    // Validate serverUrl is not undefined or empty
    if (!serverUrl || serverUrl === 'undefined' || serverUrl.includes('undefined')) {
      logger.error('Failed to determine server URL', undefined, {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
        VERCEL_URL: process.env.VERCEL_URL,
        host: req.headers.get('host'),
      });
      return NextResponse.json(
        { 
          error: 'Server URL not configured',
          message: 'Please set NEXT_PUBLIC_APP_URL environment variable or ensure RAILWAY_PUBLIC_DOMAIN is available.',
        },
        { status: 500 }
      );
    }
    
    // Generate connection token
    const token = generateConnectionToken(userId);
    
    // Check if bridge is already connected
    const bridgeManager = getBridgeManager();
    const isAlreadyConnected = bridgeManager.isConnected(userId);
    
    logger.info('Local environment connection details', {
      userId,
      serverUrl,
      isAlreadyConnected,
      envVars: {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? 'set' : 'not set',
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN ? 'set' : 'not set',
        VERCEL_URL: process.env.VERCEL_URL ? 'set' : 'not set',
      },
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

