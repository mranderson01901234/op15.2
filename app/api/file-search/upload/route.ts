import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FileSearchStoreService, ChunkingConfig } from "@/lib/llm/file-search-store";
import { logger } from "@/lib/utils/logger";

const chunkingConfigSchema = z.object({
  white_space_config: z
    .object({
      max_tokens_per_chunk: z.number().optional(),
      max_overlap_tokens: z.number().optional(),
    })
    .optional(),
});

const requestSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
  storeDisplayName: z.string().min(1, "Store display name is required"),
  displayName: z.string().optional(),
  chunkingConfig: chunkingConfigSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath, storeDisplayName, displayName, chunkingConfig } =
      requestSchema.parse(body);

    logger.info("File Search upload request", {
      filePath,
      storeDisplayName,
      displayName,
      hasChunkingConfig: !!chunkingConfig,
    });

    const service = new FileSearchStoreService();

    // Get or create the store
    const storeName = await service.getOrCreateStore(storeDisplayName);

    // Upload the file with options
    await service.uploadFile(filePath, storeName, {
      displayName,
      chunkingConfig: chunkingConfig as ChunkingConfig | undefined,
    });

    return NextResponse.json({
      success: true,
      storeName,
      message: "File uploaded successfully",
    });
  } catch (error) {
    logger.error("File Search upload error", error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to upload file",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

