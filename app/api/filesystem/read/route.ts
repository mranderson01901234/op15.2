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

    // Route to user's local agent (HTTP-first, falls back to WebSocket)
    // requestBrowserOperation will handle connection checking and provide proper error messages
    const bridgeManager = getBridgeManager();
    
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

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes('No agent connection') || errorMessage.includes('Agent not connected')) {
        return NextResponse.json(
          {
            error: 'Local agent required',
            message:
              '⚠️ Local agent required to read files.\n\n' +
              'Please install and run the local agent to access YOUR files.\n' +
              'Click "Install Local Agent" in the sidebar to get started.',
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: 'Agent operation failed',
          message: `❌ Failed to read file: ${errorMessage}`,
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

