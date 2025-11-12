import { promises as fs } from "fs";
import path from "path";
import type { UserContext } from "@/lib/types/user-context";
import { LocalFileSystem } from "@/lib/storage/local-fs";

const fileSystem = new LocalFileSystem();

/**
 * Handle text.search tool call
 * Search for text patterns in files
 */
export async function handleTextSearch(
  args: {
    path: string;
    pattern: string;
    caseSensitive?: boolean;
    maxResults?: number;
    fileExtensions?: string[];
    maxDepth?: number;
  },
  context: UserContext
) {
  const {
    path: searchPath,
    pattern,
    caseSensitive = false,
    maxResults = 100,
    fileExtensions,
    maxDepth = 0,
  } = args;

  const resolvedPath = await fileSystem.resolve(searchPath, context);
  const stats = await fs.stat(resolvedPath);

  const results: Array<{
    file: string;
    line: number;
    column: number;
    match: string;
    context?: string;
  }> = [];

  const regex = new RegExp(
    pattern,
    caseSensitive ? "g" : "gi"
  );

  const searchFile = async (filePath: string): Promise<void> => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = Array.from(line.matchAll(regex));

        for (const match of matches) {
          if (results.length >= maxResults) {
            return;
          }

          const matchText = match[0];
          const column = (match.index || 0) + 1;
          
          // Get context (previous and next line if available)
          const contextLines: string[] = [];
          if (i > 0) {
            contextLines.push(lines[i - 1]);
          }
          contextLines.push(line);
          if (i < lines.length - 1) {
            contextLines.push(lines[i + 1]);
          }

          results.push({
            file: filePath,
            line: i + 1,
            column,
            match: matchText,
            context: contextLines.join("\n"),
          });
        }
      }
    } catch (error) {
      // Skip files we can't read (permissions, binary files, etc.)
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EACCES" || err.code === "EPERM") {
        // Permission denied - skip silently
        return;
      }
      // For other errors, also skip but don't throw
      return;
    }
  };

  const searchDirectory = async (
    dirPath: string,
    currentDepth: number
  ): Promise<void> => {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) {
          return;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (currentDepth < maxDepth) {
            await searchDirectory(fullPath, currentDepth + 1);
          }
        } else if (entry.isFile()) {
          // Check file extension filter if provided
          if (fileExtensions && fileExtensions.length > 0) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!fileExtensions.some((e) => e.toLowerCase() === ext)) {
              continue;
            }
          }

          await searchFile(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EACCES" || err.code === "EPERM") {
        return;
      }
      return;
    }
  };

  if (stats.isDirectory()) {
    await searchDirectory(resolvedPath, 0);
  } else {
    await searchFile(resolvedPath);
  }

  return {
    matches: results.length,
    results: results.slice(0, maxResults),
  };
}

