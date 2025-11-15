import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { auth } from "@clerk/nextjs/server";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import type { UserContext } from "@/lib/types/user-context";

const requestSchema = z.object({
  path: z.string().min(1, "Path is required"),
  depth: z.number().optional().default(0),
});

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { path, depth } = requestSchema.parse(body);

    // Get user context with browser bridge connection status
    let browserBridgeConnected = false;
    try {
      const bridgeManager = getBridgeManager();
      browserBridgeConnected = bridgeManager.isConnected(authenticatedUserId);
    } catch (error) {
      logger.warn('Failed to check bridge connection status', { error: error instanceof Error ? error.message : String(error) });
      // Continue without bridge connection - not a fatal error
    }

    const context: UserContext = {
      userId: authenticatedUserId,
      workspaceId: undefined,
      browserBridgeConnected,
    };

    logger.info("Filesystem list request", { path, depth, userId: context.userId });

    // Check if agent is connected
    const bridgeManager = getBridgeManager();
    if (!browserBridgeConnected || !bridgeManager.isConnected(authenticatedUserId)) {
      logger.error('Agent not connected - refusing to execute on shared server', undefined, {
        userId: authenticatedUserId,
        operation: 'fs.list',
        path,
      });

      return NextResponse.json(
        {
          error: 'Local agent required',
          message:
            '⚠️ Local agent required but not connected.\n\n' +
            'To list files, you must install and run the local agent:\n' +
            '1. Click "Enable Local Environment" in the sidebar\n' +
            '2. Download and install the local agent\n' +
            '3. Run the agent with your user ID\n' +
            '4. Wait for connection confirmation\n\n' +
            'The local agent runs on YOUR machine to access YOUR files.\n' +
            'This ensures complete isolation between users.',
        },
        { status: 403 }
      );
    }

    // Route to user's local agent via WebSocket
    try {
      const result = await bridgeManager.requestBrowserOperation(
        authenticatedUserId,
        'fs.list',
        { path: path || '.', depth: depth || 0 }
      ) as Array<{ name: string; kind: string; path: string; size?: number; mtime?: string }>;

      // Transform agent response to expected format
      const entries = result.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        size: entry.size,
        mtime: entry.mtime,
      }));

      return NextResponse.json({ entries });
    } catch (error) {
      logger.error('Agent fs.list failed', error instanceof Error ? error : undefined, {
        userId: authenticatedUserId,
        path,
      });

      return NextResponse.json(
        {
          error: 'Agent operation failed',
          message: `❌ Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check that your local agent is running and the path exists.`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Filesystem list error", error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

