import { promises as fs } from "fs";
import path from "path";
import type { FileSystem } from "./interface";
import type { FileEntry } from "@/lib/types/tool-types";
import type { UserContext } from "@/lib/types/user-context";
import { FileSystemError } from "@/lib/utils/errors";
import { getEnv } from "@/lib/utils/env";

/**
 * Local filesystem implementation
 * Uses Node.js fs module directly
 * Later: Swap with VirtualFileSystem for S3-backed storage
 */
export class LocalFileSystem implements FileSystem {
  private getWorkspaceRoot(context: UserContext): string {
    const env = getEnv();
    return env.WORKSPACE_ROOT || process.cwd();
  }

  async resolve(filePath: string, context: UserContext): Promise<string> {
    const workspaceRoot = this.getWorkspaceRoot(context);
    const resolvedRoot = path.resolve(workspaceRoot);
    
    let resolvedPath: string;
    
    if (path.isAbsolute(filePath)) {
      resolvedPath = path.normalize(filePath);
    } else {
      resolvedPath = path.resolve(workspaceRoot, filePath);
    }
    
    // Normalize both paths for comparison
    const normalizedResolved = path.normalize(resolvedPath);
    const normalizedRoot = path.normalize(resolvedRoot);
    
    // Prevent path traversal attacks - ensure resolved path is within workspace root
    if (!normalizedResolved.startsWith(normalizedRoot + path.sep) && normalizedResolved !== normalizedRoot) {
      throw new FileSystemError(
        `Path traversal detected: "${filePath}" resolves outside workspace root`,
        filePath
      );
    }
    
    return normalizedResolved;
  }

  async list(
    filePath: string,
    context: UserContext,
    depth: number = 0
  ): Promise<FileEntry[]> {
    try {
      const resolvedPath = await this.resolve(filePath, context);
      const entries: FileEntry[] = [];

      const readDir = async (dirPath: string, currentDepth: number): Promise<void> => {
        if (currentDepth > depth) return;

        const items = await fs.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);
          
          try {
            const stats = await fs.stat(fullPath);

            entries.push({
              name: item.name,
              path: fullPath,
              kind: item.isDirectory() ? "directory" : "file",
              size: stats.size,
              mtime: stats.mtime,
            });

            if (item.isDirectory() && currentDepth < depth) {
              await readDir(fullPath, currentDepth + 1);
            }
          } catch (statError) {
            // Skip files/directories we can't access, but continue with others
            const errorCode = (statError as NodeJS.ErrnoException)?.code;
            if (errorCode === "EACCES" || errorCode === "EPERM") {
              // Permission denied - skip this entry
              continue;
            }
            // For other errors, still skip but log
            continue;
          }
        }
      };

      await readDir(resolvedPath, 0);
      return entries;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      const errorMessage = err?.message || "Unknown error";
      
      // Provide clearer error messages
      if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot access directory "${filePath}". The application may not have read permissions for this location.`,
          filePath,
          err
        );
      } else if (errorCode === "ENOENT") {
        throw new FileSystemError(
          `Directory not found: "${filePath}"`,
          filePath,
          err
        );
      } else if (errorCode === "ENOTDIR") {
        throw new FileSystemError(
          `Not a directory: "${filePath}"`,
          filePath,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to list directory "${filePath}": ${errorMessage}`,
        filePath,
        err
      );
    }
  }

  async move(
    source: string,
    destination: string,
    context: UserContext,
    createDestDirs: boolean = true
  ): Promise<void> {
    try {
      const resolvedSource = await this.resolve(source, context);
      const resolvedDest = await this.resolve(destination, context);

      if (createDestDirs) {
        const destDir = path.dirname(resolvedDest);
        await fs.mkdir(destDir, { recursive: true });
      }

      await fs.rename(resolvedSource, resolvedDest);
    } catch (error) {
      throw new FileSystemError(
        `Failed to move file: ${source} -> ${destination}`,
        source,
        error instanceof Error ? error : undefined
      );
    }
  }

  async read(
    filePath: string,
    context: UserContext,
    encoding: BufferEncoding = "utf8"
  ): Promise<string> {
    try {
      const resolvedPath = await this.resolve(filePath, context);
      return await fs.readFile(resolvedPath, encoding);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      
      if (errorCode === "ENOENT") {
        throw new FileSystemError(
          `File not found: "${filePath}"`,
          filePath,
          err
        );
      } else if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot read file "${filePath}"`,
          filePath,
          err
        );
      } else if (errorCode === "EISDIR") {
        throw new FileSystemError(
          `Cannot read directory as file: "${filePath}". Use fs.list to list directory contents instead.`,
          filePath,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to read file "${filePath}": ${err?.message || "Unknown error"}`,
        filePath,
        err
      );
    }
  }

  async write(
    filePath: string,
    content: string,
    context: UserContext,
    createDirs: boolean = true,
    encoding: BufferEncoding = "utf8"
  ): Promise<void> {
    try {
      const resolvedPath = await this.resolve(filePath, context);
      
      if (createDirs) {
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });
      }
      
      await fs.writeFile(resolvedPath, content, encoding);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      
      if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot write to "${filePath}"`,
          filePath,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to write file "${filePath}": ${err?.message || "Unknown error"}`,
        filePath,
        err
      );
    }
  }

  async delete(
    filePath: string,
    context: UserContext,
    recursive: boolean = false
  ): Promise<void> {
    try {
      const resolvedPath = await this.resolve(filePath, context);
      const stats = await fs.stat(resolvedPath);
      
      if (stats.isDirectory()) {
        if (recursive) {
          await fs.rm(resolvedPath, { recursive: true, force: true });
        } else {
          await fs.rmdir(resolvedPath);
        }
      } else {
        await fs.unlink(resolvedPath);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      
      if (errorCode === "ENOENT") {
        throw new FileSystemError(
          `File or directory not found: "${filePath}"`,
          filePath,
          err
        );
      } else if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot delete "${filePath}"`,
          filePath,
          err
        );
      } else if (errorCode === "ENOTEMPTY") {
        throw new FileSystemError(
          `Directory not empty: "${filePath}". Use recursive=true to delete non-empty directories.`,
          filePath,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to delete "${filePath}": ${err?.message || "Unknown error"}`,
        filePath,
        err
      );
    }
  }

  async copy(
    source: string,
    destination: string,
    context: UserContext,
    createDestDirs: boolean = true,
    recursive: boolean = false
  ): Promise<void> {
    try {
      const resolvedSource = await this.resolve(source, context);
      const resolvedDest = await this.resolve(destination, context);
      
      const stats = await fs.stat(resolvedSource);
      
      if (stats.isDirectory()) {
        if (!recursive) {
          throw new FileSystemError(
            `Cannot copy directory "${source}" without recursive=true`,
            source,
            undefined
          );
        }
        
        if (createDestDirs) {
          await fs.mkdir(resolvedDest, { recursive: true });
        }
        
        // Copy directory contents recursively
        const copyDir = async (src: string, dest: string): Promise<void> => {
          await fs.mkdir(dest, { recursive: true });
          const entries = await fs.readdir(src, { withFileTypes: true });
          
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
              await copyDir(srcPath, destPath);
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        };
        
        await copyDir(resolvedSource, resolvedDest);
      } else {
        if (createDestDirs) {
          const destDir = path.dirname(resolvedDest);
          await fs.mkdir(destDir, { recursive: true });
        }
        
        await fs.copyFile(resolvedSource, resolvedDest);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      
      if (errorCode === "ENOENT") {
        throw new FileSystemError(
          `Source not found: "${source}"`,
          source,
          err
        );
      } else if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot copy "${source}" to "${destination}"`,
          source,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to copy "${source}" to "${destination}": ${err?.message || "Unknown error"}`,
        source,
        err
      );
    }
  }

  async create(
    dirPath: string,
    context: UserContext,
    recursive: boolean = true
  ): Promise<void> {
    try {
      const resolvedPath = await this.resolve(dirPath, context);
      await fs.mkdir(resolvedPath, { recursive });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const errorCode = err?.code;
      
      if (errorCode === "EEXIST") {
        throw new FileSystemError(
          `Directory already exists: "${dirPath}"`,
          dirPath,
          err
        );
      } else if (errorCode === "EACCES" || errorCode === "EPERM") {
        throw new FileSystemError(
          `Permission denied: Cannot create directory "${dirPath}"`,
          dirPath,
          err
        );
      }
      
      throw new FileSystemError(
        `Failed to create directory "${dirPath}": ${err?.message || "Unknown error"}`,
        dirPath,
        err
      );
    }
  }
}

