import { GoogleGenAI } from "@google/genai";
import { getChatEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * Chunking configuration for File Search stores
 */
export interface ChunkingConfig {
  white_space_config?: {
    max_tokens_per_chunk?: number;
    max_overlap_tokens?: number;
  };
}

/**
 * File upload options
 */
export interface FileUploadOptions {
  displayName?: string;
  chunkingConfig?: ChunkingConfig;
}

/**
 * File Search Store Service
 * Manages File Search stores and file uploads for Gemini
 */
export class FileSearchStoreService {
  private client: GoogleGenAI;
  private storeCache: Map<string, string> = new Map(); // displayName -> storeName

  constructor() {
    const env = getChatEnv();
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  /**
   * Get or create a File Search store by display name
   * Uses caching to avoid creating duplicate stores
   */
  async getOrCreateStore(displayName: string): Promise<string> {
    // Check cache first
    if (this.storeCache.has(displayName)) {
      return this.storeCache.get(displayName)!;
    }

    try {
      // Create the File Search store
      const fileSearchStore = await (this.client as any).file_search_stores.create({
        config: { display_name: displayName },
      });

      const storeName = fileSearchStore.name;
      this.storeCache.set(displayName, storeName);

      logger.info("Created File Search store", { displayName, storeName });
      return storeName;
    } catch (error) {
      logger.error("Failed to create File Search store", error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Upload a file using the Files API first, then import to File Search store
   * This follows the optimal pattern from the reference code
   * @param filePath - Path to the file to upload (can be from any directory)
   * @returns The uploaded file name that can be used for importing
   */
  private async uploadFileToFilesAPI(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      const fileName = path.basename(filePath);

      // Read file content
      const fileBuffer = await fs.readFile(absolutePath);

      // Upload file using Files API
      // The API accepts file path or File object
      const uploadedFile = await (this.client as any).files.upload(
        absolutePath,
        {
          name: fileName,
        }
      );

      logger.info("File uploaded to Files API", {
        filePath,
        fileName: uploadedFile.name,
      });

      return uploadedFile.name;
    } catch (error) {
      logger.error("Failed to upload file to Files API", error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Upload a file to a File Search store with optional chunking configuration
   * Follows the reference code pattern: upload file first, then import with config
   * @param filePath - Path to the file to upload (can be from any directory)
   * @param storeName - Name of the File Search store
   * @param options - Upload options including display name and chunking config
   * @returns Promise that resolves when upload is complete
   */
  async uploadFile(
    filePath: string,
    storeName: string,
    options?: FileUploadOptions
  ): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);
      const displayName = options?.displayName || path.basename(filePath);

      // Step 1: Upload file to Files API first
      const uploadedFileName = await this.uploadFileToFilesAPI(absolutePath);

      // Step 2: Build config with display name and optional chunking
      const config: any = {
        display_name: displayName,
      };

      // Add chunking config if provided
      if (options?.chunkingConfig) {
        config.chunking_config = options.chunkingConfig;
      }

      // Step 3: Import file into File Search store with config
      const operation = await (this.client as any).file_search_stores.upload_to_file_search_store(
        storeName,
        uploadedFileName,
        config
      );

      // Wait until import is complete
      await this.waitForOperation(operation);

      logger.info("File uploaded to File Search store", {
        filePath,
        displayName,
        storeName,
        hasChunkingConfig: !!options?.chunkingConfig,
      });
    } catch (error) {
      logger.error("Failed to upload file to File Search store", error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Upload multiple files to a File Search store
   * @param filePaths - Array of file paths (can be from different directories)
   * @param storeName - Name of the File Search store
   * @param options - Optional upload options applied to all files
   */
  async uploadFiles(
    filePaths: string[],
    storeName: string,
    options?: FileUploadOptions
  ): Promise<void> {
    const uploadPromises = filePaths.map((filePath) =>
      this.uploadFile(filePath, storeName, options)
    );
    await Promise.all(uploadPromises);
  }

  /**
   * Upload files from different directories with individual chunking configs
   * Uses rate limiting to avoid overwhelming the Gemini API
   * @param files - Array of file upload configurations
   * @param storeName - Name of the File Search store
   * @returns Object with success count and failed files
   */
  async uploadFilesWithConfig(
    files: Array<{ filePath: string; options?: FileUploadOptions }>,
    storeName: string
  ): Promise<{ successCount: number; failedFiles: Array<{ filePath: string; error: string }> }> {
    // Rate limiting: process files in batches with concurrency limit
    const CONCURRENT_UPLOADS = 3; // Max 3 concurrent uploads at a time
    const DELAY_BETWEEN_BATCHES = 500; // 500ms delay between batches
    
    const results: PromiseSettledResult<void>[] = [];
    
    // Process files in batches
    for (let i = 0; i < files.length; i += CONCURRENT_UPLOADS) {
      const batch = files.slice(i, i + CONCURRENT_UPLOADS);
      
      logger.debug(`Uploading batch ${Math.floor(i / CONCURRENT_UPLOADS) + 1}`, {
        batchStart: i + 1,
        batchEnd: Math.min(i + CONCURRENT_UPLOADS, files.length),
        totalFiles: files.length,
      });
      
      // Upload batch concurrently
      const batchResults = await Promise.allSettled(
        batch.map(({ filePath, options }) =>
          this.uploadFile(filePath, storeName, options)
        )
      );
      
      results.push(...batchResults);
      
      // Add delay between batches (except for the last batch)
      if (i + CONCURRENT_UPLOADS < files.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedFiles = results
      .map((result, index) => ({
        result,
        filePath: files[index].filePath,
      }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ result, filePath }) => ({
        filePath,
        error: result.status === 'rejected' 
          ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
          : 'Unknown error',
      }));

    if (failedFiles.length > 0) {
      logger.warn("Some files failed to upload", {
        successCount,
        failedCount: failedFiles.length,
        totalFiles: files.length,
      });
    }

    return { successCount, failedFiles };
  }

  /**
   * Wait for an operation to complete
   */
  private async waitForOperation(operation: any): Promise<void> {
    let currentOperation = operation;
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes max
    const startTime = Date.now();

    while (!currentOperation.done) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error("Operation timeout: File upload took too long");
      }

      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      try {
        currentOperation = await (this.client as any).operations.get(currentOperation);
      } catch (error) {
        logger.error("Failed to check operation status", error instanceof Error ? error : undefined);
        throw error;
      }
    }

    if (currentOperation.error) {
      throw new Error(
        `Operation failed: ${JSON.stringify(currentOperation.error)}`
      );
    }
  }

  /**
   * Get all cached store names
   */
  getCachedStores(): string[] {
    return Array.from(this.storeCache.values());
  }

  /**
   * Clear the store cache
   */
  clearCache(): void {
    this.storeCache.clear();
  }
}

