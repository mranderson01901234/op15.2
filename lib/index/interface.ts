import type { UserContext } from "@/lib/types/user-context";

/**
 * RAG integration options for indexing
 */
export interface RAGOptions {
  /**
   * Whether to upload files to File Search stores during indexing
   * Defaults to true - set to false to disable RAG uploads
   */
  enableRAG?: boolean;
  /**
   * File Search store display name to use (defaults to root directory name)
   */
  storeDisplayName?: string;
  /**
   * File extensions to include in RAG upload (defaults to common text/code files)
   */
  includeExtensions?: string[];
  /**
   * Maximum file size to upload to RAG (in bytes, defaults to 10MB)
   */
  maxFileSize?: number;
}

/**
 * Index interface - abstracted for easy swapping
 * Current: MemoryIndex
 * Later: DatabaseIndex (PostgreSQL)
 */
export interface Index {
  /**
   * Scan and index a directory tree
   * @param ragOptions - Optional RAG integration options
   */
  scan(
    root: string,
    context: UserContext,
    maxDepth?: number,
    followSymlinks?: boolean,
    ragOptions?: RAGOptions
  ): Promise<{ count: number; ragStoreName?: string }>;

  /**
   * Scan and index multiple directory trees in parallel
   * @param roots - Array of root directories to scan
   * @param ragOptions - Optional RAG integration options (applied to all directories)
   */
  scanMultiple(
    roots: string[],
    context: UserContext,
    maxDepth?: number,
    followSymlinks?: boolean,
    ragOptions?: RAGOptions
  ): Promise<Array<{ root: string; count: number; ragStoreName?: string }>>;

  /**
   * Find closest matching paths for a query
   */
  findClosest(query: string, context: UserContext, limit?: number): Promise<string[]>;

  /**
   * Get File Search store names for indexed directories (for RAG integration)
   */
  getRAGStoreNames(context: UserContext): Promise<string[]>;

  /**
   * Clear index for a user/workspace
   */
  clear(context: UserContext): Promise<void>;
}

