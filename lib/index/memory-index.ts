import { promises as fs } from "fs";
import path from "path";
import type { Index, RAGOptions } from "./interface";
import type { UserContext } from "@/lib/types/user-context";
import { logger } from "@/lib/utils/logger";
import { FileSearchStoreService } from "@/lib/llm/file-search-store";

/**
 * In-memory index implementation
 * Stores paths in memory and persists to /index.json
 * Later: Swap with DatabaseIndex for PostgreSQL-backed storage
 */
export class MemoryIndex implements Index {
  private index: Map<string, Set<string>> = new Map(); // userId -> Set of paths
  private ragStores: Map<string, Map<string, string>> = new Map(); // userId -> Map<root, storeName>
  private indexFile = path.join(process.cwd(), "index.json");
  private ragMetadataFile = path.join(process.cwd(), "index-rag.json");
  private isLoaded = false; // Track if index has been loaded to avoid redundant loads
  private ragService: FileSearchStoreService | null = null;

  private getUserKey(context: UserContext): string {
    return context.workspaceId || context.userId;
  }

  private getRAGService(): FileSearchStoreService {
    if (!this.ragService) {
      this.ragService = new FileSearchStoreService();
    }
    return this.ragService;
  }

  private async loadRAGMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(this.ragMetadataFile, "utf-8");
      const parsed = JSON.parse(data) as Record<string, Record<string, string>>;
      
      this.ragStores.clear();
      for (const [userKey, stores] of Object.entries(parsed)) {
        this.ragStores.set(userKey, new Map(Object.entries(stores)));
      }
      
      logger.debug("Loaded RAG metadata", { userCount: this.ragStores.size });
    } catch (error) {
      // File doesn't exist yet, start fresh
      logger.debug("No existing RAG metadata file");
    }
  }

  private async saveRAGMetadata(): Promise<void> {
    try {
      const data: Record<string, Record<string, string>> = {};
      for (const [userKey, stores] of this.ragStores.entries()) {
        data[userKey] = Object.fromEntries(stores);
      }
      
      await fs.writeFile(this.ragMetadataFile, JSON.stringify(data), "utf-8");
      logger.debug("Saved RAG metadata", { userCount: this.ragStores.size });
    } catch (error) {
      logger.error("Failed to save RAG metadata", error instanceof Error ? error : undefined);
    }
  }

  private async loadIndex(force = false): Promise<void> {
    // Skip if already loaded unless forced (e.g., after external changes)
    if (this.isLoaded && !force) {
      return;
    }

    try {
      const data = await fs.readFile(this.indexFile, "utf-8");
      const parsed = JSON.parse(data) as Record<string, string[]>;
      
      this.index.clear();
      for (const [key, paths] of Object.entries(parsed)) {
        this.index.set(key, new Set(paths));
      }
      
      this.isLoaded = true;
      logger.debug("Loaded index from disk", { 
        count: this.index.size,
        totalPaths: Array.from(this.index.values()).reduce((sum, set) => sum + set.size, 0)
      });
    } catch (error) {
      // File doesn't exist yet, start fresh
      this.isLoaded = true; // Mark as loaded even if file doesn't exist
      logger.debug("No existing index file, starting fresh");
    }

    // Also load RAG metadata
    await this.loadRAGMetadata();
  }

  private async saveIndex(): Promise<void> {
    try {
      const data: Record<string, string[]> = {};
      let totalPaths = 0;
      for (const [key, paths] of this.index.entries()) {
        const pathArray = Array.from(paths);
        data[key] = pathArray;
        totalPaths += pathArray.length;
      }
      
      // Use compact JSON (no pretty printing) for better performance with large files
      await fs.writeFile(this.indexFile, JSON.stringify(data), "utf-8");
      logger.debug("Saved index to disk", { 
        userCount: this.index.size,
        totalPaths 
      });
    } catch (error) {
      logger.error("Failed to save index", error instanceof Error ? error : undefined);
    }
  }

  async scan(
    root: string,
    context: UserContext,
    maxDepth: number = 4,
    followSymlinks: boolean = false,
    ragOptions?: RAGOptions
  ): Promise<{ count: number; ragStoreName?: string }> {
    // Load existing index first to merge with new paths
    await this.loadIndex();
    
    const userKey = this.getUserKey(context);
    // Get existing paths for this user, or create new set
    const existingPaths = this.index.get(userKey) || new Set<string>();
    const newPaths = new Set<string>();
    const filesToUpload: string[] = [];

    // Default RAG options - enableRAG defaults to false (opt-in)
    const enableRAG = ragOptions?.enableRAG === true; // Only enable if explicitly set to true
    const defaultExtensions = [
      '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv',
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala',
      '.html', '.css', '.scss', '.sass', '.less',
      '.sql', '.sh', '.bash', '.zsh', '.fish',
      '.toml', '.ini', '.cfg', '.conf', '.env'
    ];
    const includeExtensions = ragOptions?.includeExtensions || defaultExtensions;
    const maxFileSize = ragOptions?.maxFileSize || 10 * 1024 * 1024; // 10MB default

    const walk = async (dirPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > maxDepth) return;

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          try {
            const stats = await fs.stat(fullPath);
            
            if (entry.isDirectory()) {
              newPaths.add(fullPath);
              if (currentDepth < maxDepth) {
                await walk(fullPath, currentDepth + 1);
              }
            } else {
              newPaths.add(fullPath);
              
              // Collect files for RAG upload (if enabled)
              if (enableRAG) {
                const ext = path.extname(fullPath).toLowerCase();
                if (includeExtensions.includes(ext) && stats.size <= maxFileSize) {
                  filesToUpload.push(fullPath);
                }
              }
            }
          } catch (error) {
            // Skip files we can't access
            logger.debug("Skipping inaccessible path", { path: fullPath });
          }
        }
      } catch (error) {
        logger.warn("Failed to scan directory", { path: dirPath, error });
      }
    };

    await walk(root, 0);
    
    // Merge new paths with existing paths
    const mergedPaths = new Set<string>([...existingPaths, ...newPaths]);
    this.index.set(userKey, mergedPaths);
    await this.saveIndex();

    let ragStoreName: string | undefined;
    
    // Upload files to RAG (if enabled)
    if (enableRAG && filesToUpload.length > 0) {
      try {
        const storeDisplayName = ragOptions?.storeDisplayName || 
          `Index: ${path.basename(root) || root}`;
        
        const ragService = this.getRAGService();
        ragStoreName = await ragService.getOrCreateStore(storeDisplayName);
        
        logger.info("Preparing batch upload to RAG store", {
          storeName: ragStoreName,
          fileCount: filesToUpload.length,
          root,
          note: "Uploading files with rate limiting (3 concurrent, 500ms delay between batches)"
        });

        // Prepare all files with their display names upfront
        const filesWithConfig = filesToUpload.map(filePath => ({
          filePath,
          options: {
            displayName: path.relative(root, filePath) || path.basename(filePath)
          }
        }));

        // Upload all files at once using batch method
        // All files upload in parallel - much faster than sequential uploads
        const uploadResult = await ragService.uploadFilesWithConfig(filesWithConfig, ragStoreName);

        // Track RAG store for this root directory
        const userRAGStores = this.ragStores.get(userKey) || new Map();
        userRAGStores.set(root, ragStoreName);
        this.ragStores.set(userKey, userRAGStores);
        await this.saveRAGMetadata();

        logger.info("RAG batch upload complete", {
          storeName: ragStoreName,
          totalFiles: filesToUpload.length,
          successCount: uploadResult.successCount,
          failedCount: uploadResult.failedFiles.length,
        });

        // Log failed files if any
        if (uploadResult.failedFiles.length > 0) {
          logger.warn("Some files failed to upload to RAG", {
            failedFiles: uploadResult.failedFiles.slice(0, 10), // Log first 10 failures
            totalFailed: uploadResult.failedFiles.length,
          });
        }
      } catch (error) {
        logger.error("Failed to upload files to RAG", error instanceof Error ? error : undefined);
        // Continue even if RAG upload fails - paths are still indexed
      }
    }

    logger.info("Index scan complete", { 
      root, 
      newPaths: newPaths.size, 
      totalPaths: mergedPaths.size,
      ragFiles: filesToUpload.length,
      ragStoreName,
      userKey 
    });
    
    return { 
      count: mergedPaths.size,
      ragStoreName
    };
  }

  async findClosest(
    query: string,
    context: UserContext,
    limit: number = 10
  ): Promise<string[]> {
    await this.loadIndex();
    
    const userKey = this.getUserKey(context);
    const paths = this.index.get(userKey) || new Set<string>();
    
    // Early return if no paths
    if (paths.size === 0) {
      return [];
    }
    
    const queryLower = query.toLowerCase();
    const matches: Array<{ path: string; score: number }> = [];

    for (const filePath of paths) {
      const fileName = path.basename(filePath).toLowerCase();
      const dirName = path.dirname(filePath).toLowerCase();
      const pathLower = filePath.toLowerCase();
      
      let score = 0;
      
      // Exact match gets highest score (early return for perfect matches)
      if (fileName === queryLower || pathLower === queryLower) {
        score = 100;
        // For exact matches, add immediately and continue (we'll sort later)
      } else if (fileName.startsWith(queryLower)) {
        score = 50;
      } else if (fileName.includes(queryLower)) {
        score = 25;
      } else if (dirName.includes(queryLower)) {
        score = 10;
      }

      if (score > 0) {
        matches.push({ path: filePath, score });
        
        // Early termination: if we have enough high-scoring matches, we can stop early
        // This is a heuristic - exact matches (score 100) are rare, so continue scanning
        // but if we have many matches already, we might have enough
        if (matches.length > limit * 10 && score >= 50) {
          // If we have 10x the limit and current match is high-scoring, likely enough
          break;
        }
      }
    }

    // Sort by score descending, limit results
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map((m) => m.path);
  }

  async scanMultiple(
    roots: string[],
    context: UserContext,
    maxDepth: number = 4,
    followSymlinks: boolean = false,
    ragOptions?: RAGOptions
  ): Promise<Array<{ root: string; count: number; ragStoreName?: string }>> {
    // RAG disabled by default, must be explicitly enabled
    const enableRAG = ragOptions?.enableRAG === true;
    
    logger.info("Starting parallel scan of multiple directories", {
      directoryCount: roots.length,
      enableRAG,
    });

    // Scan all directories in parallel
    // Pass ragOptions with enableRAG flag to each scan
    const scanPromises = roots.map(root =>
      this.scan(root, context, maxDepth, followSymlinks, {
        ...ragOptions,
        enableRAG, // Use the computed enableRAG value
      })
        .then(result => ({ root, ...result }))
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to scan directory", error instanceof Error ? error : undefined, { root, error: errorMessage });
          return { root, count: 0 };
        })
    );

    const results = await Promise.all(scanPromises);

    logger.info("Parallel scan complete", {
      directoryCount: roots.length,
      totalPaths: results.reduce((sum, r) => sum + r.count, 0),
      ragStoresCreated: results.filter((r): r is { root: string; count: number; ragStoreName: string } => 
        'ragStoreName' in r && typeof r.ragStoreName === 'string'
      ).length,
    });

    return results;
  }

  async getRAGStoreNames(context: UserContext): Promise<string[]> {
    await this.loadIndex();
    
    const userKey = this.getUserKey(context);
    const userRAGStores = this.ragStores.get(userKey);
    
    if (!userRAGStores || userRAGStores.size === 0) {
      return [];
    }
    
    // Return unique store names
    return Array.from(new Set(userRAGStores.values()));
  }

  async clear(context: UserContext): Promise<void> {
    // Load existing index first to ensure we're working with latest data
    await this.loadIndex();
    
    const userKey = this.getUserKey(context);
    this.index.delete(userKey);
    this.ragStores.delete(userKey);
    await this.saveIndex();
    await this.saveRAGMetadata();
    logger.info("Cleared index", { userKey });
  }
}

