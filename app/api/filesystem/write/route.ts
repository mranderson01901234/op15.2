import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { path, content } = body;

    if (!path) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    if (content === undefined) {
      return NextResponse.json(
        { error: "Content parameter is required" },
        { status: 400 }
      );
    }

    // Check if agent is connected
    const bridgeManager = getBridgeManager();
    const isAgentConnected = bridgeManager.isConnected(authenticatedUserId);

    if (!isAgentConnected) {
      logger.error('Agent not connected - refusing to execute on shared server', undefined, {
        userId: authenticatedUserId,
        operation: 'fs.write',
        path,
      });

      return NextResponse.json(
        {
          error: 'Local agent required',
          message:
            '⚠️ Local agent required to write files.\n\n' +
            'Please install and run the local agent to modify YOUR files.',
        },
        { status: 403 }
      );
    }

    // Route to user's local agent
    try {
      await bridgeManager.requestBrowserOperation(
        authenticatedUserId,
        'fs.write',
        { path, content, createDirs: true, encoding: 'utf8' }
      );

      return NextResponse.json({
        success: true,
        path,
      });
    } catch (error) {
      logger.error('Agent fs.write failed', undefined, {
        userId: authenticatedUserId,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          error: 'Agent operation failed',
          message: `❌ Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Filesystem write error", error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to write file",
      },
      { status: 500 }
    );
  }
}

