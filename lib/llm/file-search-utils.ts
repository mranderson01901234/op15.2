import {
  FileSearchStoreService,
  FileUploadOptions,
  ChunkingConfig,
} from "./file-search-store";
import { logger } from "@/lib/utils/logger";

/**
 * Utility functions for File Search store operations
 * Follows the reference code pattern for optimal usage
 */

/**
 * Create a File Search store and upload files - optimized helper
 * This function follows the reference code pattern:
 * 1. Create/get store
 * 2. Upload files (from any directories)
 * 3. Wait for completion
 * 
 * @param storeDisplayName - Display name for the store
 * @param filePaths - Array of file paths to upload (can be from different directories)
 * @param options - Optional upload options applied to all files
 * @returns Store name that can be used in generateContent calls
 */
export async function setupFileSearchStore(
  storeDisplayName: string,
  filePaths: string[],
  options?: FileUploadOptions
): Promise<string> {
  const service = new FileSearchStoreService();

  try {
    // Create the File Search store (or get existing)
    const storeName = await service.getOrCreateStore(storeDisplayName);

    // Upload all files with options
    await service.uploadFiles(filePaths, storeName, options);

    logger.info("File Search store setup complete", {
      storeDisplayName,
      storeName,
      fileCount: filePaths.length,
      hasChunkingConfig: !!options?.chunkingConfig,
    });

    return storeName;
  } catch (error) {
    logger.error("Failed to setup File Search store", error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Upload a single file to a File Search store with optional chunking config
 * @param filePath - Path to the file (can be from any directory)
 * @param storeDisplayName - Display name for the store
 * @param options - Upload options including display name and chunking config
 * @returns Store name
 */
export async function uploadFileToStore(
  filePath: string,
  storeDisplayName: string,
  options?: FileUploadOptions
): Promise<string> {
  const service = new FileSearchStoreService();

  try {
    const storeName = await service.getOrCreateStore(storeDisplayName);
    await service.uploadFile(filePath, storeName, options);

    return storeName;
  } catch (error) {
    logger.error("Failed to upload file to store", error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Upload files from different directories with custom chunking configurations
 * @param storeDisplayName - Display name for the store
 * @param files - Array of file configurations with individual options
 * @returns Store name
 */
export async function uploadFilesWithConfigs(
  storeDisplayName: string,
  files: Array<{ filePath: string; options?: FileUploadOptions }>
): Promise<string> {
  const service = new FileSearchStoreService();

  try {
    const storeName = await service.getOrCreateStore(storeDisplayName);
    await service.uploadFilesWithConfig(files, storeName);

    logger.info("Files uploaded with individual configs", {
      storeDisplayName,
      storeName,
      fileCount: files.length,
    });

    return storeName;
  } catch (error) {
    logger.error("Failed to upload files with configs", error instanceof Error ? error : undefined);
    throw error;
  }
}

