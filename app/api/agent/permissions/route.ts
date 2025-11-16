import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * Proxy API for agent permissions
 * Browser can't directly call localhost:4001 due to CORS, so we proxy through Next.js
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get agent HTTP port from metadata
    let httpPort = 4001;
    if (typeof global !== 'undefined' && (global as any).agentMetadata) {
      const metadata = (global as any).agentMetadata.get(userId);
      if (metadata?.httpPort) {
        httpPort = metadata.httpPort;
      }
    }

    // Proxy request to agent HTTP API
    const response = await fetch(`http://127.0.0.1:${httpPort}/status`);
    if (!response.ok) {
      return NextResponse.json({ error: 'Agent not available' }, { status: 503 });
    }

    const status = await response.json();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get agent status', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Get agent HTTP port from metadata
    let httpPort = 4001;
    if (typeof global !== 'undefined' && (global as any).agentMetadata) {
      const metadata = (global as any).agentMetadata.get(userId);
      if (metadata?.httpPort) {
        httpPort = metadata.httpPort;
      }
    }

    // Proxy request to agent HTTP API
    const response = await fetch(`http://127.0.0.1:${httpPort}/plan/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(error, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to approve permissions', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

