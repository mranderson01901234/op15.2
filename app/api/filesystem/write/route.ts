import { NextRequest, NextResponse } from "next/server";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import { auth } from "@clerk/nextjs/server";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import type { UserContext } from "@/lib/types/user-context";

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

    // Get user context with browser bridge connection status
    let browserBridgeConnected = false;
    try {
      const bridgeManager = getBridgeManager();
      browserBridgeConnected = bridgeManager.isConnected(authenticatedUserId);
    } catch (error) {
      // Continue without bridge connection - not a fatal error
    }

    const context: UserContext = {
      userId: authenticatedUserId,
      workspaceId: undefined,
      browserBridgeConnected,
    };

    const fileSystem = new LocalFileSystem();
    await fileSystem.write(path, content, context, true, "utf8");

    return NextResponse.json({
      success: true,
      path,
    });
  } catch (error) {
    console.error("Error writing file:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to write file",
      },
      { status: 500 }
    );
  }
}

