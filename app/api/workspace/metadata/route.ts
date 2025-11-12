/**
 * Workspace metadata endpoint
 * Receives workspace metadata from browser bridge
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logger } from '@/lib/utils/logger';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, metadata } = body;

    // Verify user ID matches
    if (userId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    logger.info('Workspace metadata received', {
      userId,
      metadata,
    });

    // Store metadata (in production, save to database)
    // For now, just log it

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('Workspace metadata error', error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

