import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FileSearchStoreService } from "@/lib/llm/file-search-store";
import { logger } from "@/lib/utils/logger";

const createStoreSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
});

/**
 * POST /api/file-search/stores
 * Create a new File Search store
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { displayName } = createStoreSchema.parse(body);

    logger.info("Create File Search store request", { displayName });

    const service = new FileSearchStoreService();
    const storeName = await service.getOrCreateStore(displayName);

    return NextResponse.json({
      success: true,
      storeName,
      displayName,
    });
  } catch (error) {
    logger.error("Create File Search store error", error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create store",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/file-search/stores
 * Get all cached File Search stores
 */
export async function GET(req: NextRequest) {
  try {
    const service = new FileSearchStoreService();
    const stores = service.getCachedStores();

    return NextResponse.json({
      success: true,
      stores,
    });
  } catch (error) {
    logger.error("Get File Search stores error", error instanceof Error ? error : undefined);

    return NextResponse.json(
      {
        error: "Failed to get stores",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

