import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    // Check if agent is connected
    const bridgeManager = getBridgeManager();
    const isAgentConnected = bridgeManager.isConnected(authenticatedUserId);

    if (!isAgentConnected) {
      logger.error('Agent not connected - refusing to execute on shared server', undefined, {
        userId: authenticatedUserId,
        operation: 'fs.read',
        path,
      });

      return NextResponse.json(
        {
          error: 'Local agent required',
          message:
            '⚠️ Local agent required to read files.\n\n' +
            'Please install and run the local agent to access YOUR files.',
        },
        { status: 403 }
      );
    }

    // Route to user's local agent
    try {
      const result = await bridgeManager.requestBrowserOperation(
        authenticatedUserId,
        'fs.read',
        { path, encoding: 'utf8' }
      ) as { content: string };

      return NextResponse.json({
        content: result.content,
        path,
      });
    } catch (error) {
      logger.error('Agent fs.read failed', undefined, {
        userId: authenticatedUserId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          error: 'Agent operation failed',
          message: `❌ Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Filesystem read error", error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read file",
      },
      { status: 500 }
    );
  }
}

