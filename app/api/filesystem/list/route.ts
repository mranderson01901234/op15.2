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

    logger.info("Filesystem list request", { path, depth, userId: authenticatedUserId });

    // Route to user's local agent (HTTP-first, falls back to WebSocket)
    // requestBrowserOperation will handle connection checking and provide proper error messages
    const bridgeManager = getBridgeManager();
    
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

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes('No agent connection') || errorMessage.includes('Agent not connected')) {
        return NextResponse.json(
          {
            error: 'Local agent required',
            message:
              '⚠️ Local agent required to list files.\n\n' +
              'Please install and run the local agent to access YOUR files.\n' +
              'Click "Install Local Agent" in the sidebar to get started.',
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: 'Agent operation failed',
          message: `❌ Failed to list files: ${errorMessage}\n\nPlease check that your local agent is running and the path exists.`,
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

