import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { auth } from "@clerk/nextjs/server";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import type { UserContext } from "@/lib/types/user-context";
import { LocalFileSystem } from "@/lib/storage/local-fs";

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

    // Get raw entries for file tree (not formatted output)
    let entries: Array<{ name: string; path: string; kind: string; size?: number; mtime?: string }> = [];

    // Check if browser bridge is connected
    const bridgeManager = getBridgeManager();
    if (browserBridgeConnected && bridgeManager.isConnected(authenticatedUserId)) {
      try {
        const result = await bridgeManager.requestBrowserOperation(
          authenticatedUserId,
          'fs.list',
          { path: path || '.' }
        ) as Array<{ name: string; kind: string; path: string }>;
        
        // Transform browser bridge response to match expected format
        entries = result.map((entry) => ({
          name: entry.name,
          path: entry.path,
          kind: entry.kind,
          size: undefined, // Browser API doesn't provide size
          mtime: undefined, // Browser API doesn't provide mtime
        }));
      } catch (error) {
        logger.warn('Browser bridge failed, falling back to server-side', {
          userId: authenticatedUserId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Fall through to server-side implementation
      }
    }

    // Server-side fallback (if bridge not used or failed)
    if (entries.length === 0) {
      const fileSystem = new LocalFileSystem();
      const fsEntries = await fileSystem.list(path, context, depth || 0);
      entries = fsEntries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        size: entry.size,
        mtime: entry.mtime?.toISOString(),
      }));
    }

    // Ensure entries is always an array
    if (!Array.isArray(entries)) {
      entries = [];
    }

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

