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

const fileUploadSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
  displayName: z.string().optional(),
  chunkingConfig: chunkingConfigSchema.optional(),
});

const requestSchema = z.object({
  storeDisplayName: z.string().min(1, "Store display name is required"),
  files: z.array(fileUploadSchema).min(1, "At least one file is required"),
});

/**
 * POST /api/file-search/upload-batch
 * Upload multiple files from different directories with individual configurations
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storeDisplayName, files } = requestSchema.parse(body);

    logger.info("File Search batch upload request", {
      storeDisplayName,
      fileCount: files.length,
    });

    const service = new FileSearchStoreService();

    // Get or create the store
    const storeName = await service.getOrCreateStore(storeDisplayName);

    // Upload files with individual configs
    await service.uploadFilesWithConfig(
      files.map((file) => ({
        filePath: file.filePath,
        options: {
          displayName: file.displayName,
          chunkingConfig: file.chunkingConfig as ChunkingConfig | undefined,
        },
      })),
      storeName
    );

    return NextResponse.json({
      success: true,
      storeName,
      uploadedCount: files.length,
      message: "Files uploaded successfully",
    });
  } catch (error) {
    logger.error("File Search batch upload error", error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to upload files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

