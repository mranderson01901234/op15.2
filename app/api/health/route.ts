import { NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/utils/clerk-env';
import { getChatEnv } from '@/lib/utils/env';

/**
 * Health check endpoint
 * Returns application status and configuration
 */
export async function GET() {
  try {
    const checks = {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        clerk: isClerkConfigured(),
        gemini: (() => {
          try {
            getChatEnv();
            return true;
          } catch {
            return false;
          }
        })(),
      },
    };

    // Determine overall health status
    const allChecksPass = checks.checks.clerk && checks.checks.gemini;
    const statusCode = allChecksPass ? 200 : 503; // Service Unavailable if critical checks fail

    return NextResponse.json(checks, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

