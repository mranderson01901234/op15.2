import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleFsList } from "@/lib/tools/fs";
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

    const entries = await handleFsList({ path, depth }, context);

    return NextResponse.json({ entries });
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

