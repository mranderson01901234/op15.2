import type { FileEntry } from "@/lib/types/tool-types";
import type { UserContext } from "@/lib/types/user-context";

/**
 * FileSystem interface - abstracted for easy swapping
 * Current: LocalFileSystem
 * Later: VirtualFileSystem (S3-backed)
 */
export interface FileSystem {
  /**
   * List files and directories at a path
   */
  list(path: string, context: UserContext, depth?: number): Promise<FileEntry[]>;

  /**
   * Move or rename a file or directory
   */
  move(
    source: string,
    destination: string,
    context: UserContext,
    createDestDirs?: boolean
  ): Promise<void>;

  /**
   * Resolve a path (absolute or relative)
   */
  resolve(path: string, context: UserContext): Promise<string>;

  /**
   * Read file contents as text
   */
  read(path: string, context: UserContext, encoding?: BufferEncoding): Promise<string>;

  /**
   * Write text content to a file (creates file if it doesn't exist)
   */
  write(
    path: string,
    content: string,
    context: UserContext,
    createDirs?: boolean,
    encoding?: BufferEncoding
  ): Promise<void>;

  /**
   * Delete a file or directory (recursive for directories)
   */
  delete(path: string, context: UserContext, recursive?: boolean): Promise<void>;

  /**
   * Copy a file or directory (recursive for directories)
   */
  copy(
    source: string,
    destination: string,
    context: UserContext,
    createDestDirs?: boolean,
    recursive?: boolean
  ): Promise<void>;

  /**
   * Create a directory (and parent directories if needed)
   */
  create(path: string, context: UserContext, recursive?: boolean): Promise<void>;
}

