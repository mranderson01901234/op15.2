import type { FileSystem } from "@/lib/storage/interface";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import type { UserContext } from "@/lib/types/user-context";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

const fileSystem: FileSystem = new LocalFileSystem();

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date in readable format
 */
function formatDate(date: string | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

/**
 * Handle fs.list tool call
 * Uses browser bridge if connected, otherwise falls back to server-side
 * Returns formatted markdown table for better readability
 */
export async function handleFsList(
  args: { path: string; depth?: number },
  context: UserContext
) {
  let entries: Array<{ name: string; path: string; kind: string; size?: number; mtime?: string }> = [];

  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  const isBrowserBridgeConnected = context.browserBridgeConnected && bridgeManager.isConnected(context.userId);
  
  if (isBrowserBridgeConnected) {
    // When browser bridge is connected, ONLY use browser bridge - never fall back to server-side
    // Server-side has workspace root restrictions that would block paths outside the workspace
    try {
      logger.debug('Using browser bridge for fs.list', { userId: context.userId, path: args.path });
      const result = await bridgeManager.requestBrowserOperation(
        context.userId,
        'fs.list',
        { path: args.path || '.' }
      ) as Array<{ name: string; kind: string; path: string }>;

      // Transform browser bridge response to match expected format
      entries = result.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        size: undefined, // Browser API doesn't provide size
        mtime: undefined, // Browser API doesn't provide mtime
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Browser bridge failed', error instanceof Error ? error : undefined, {
        userId: context.userId,
        path: args.path,
        error: errorMessage,
      });
      
      // When browser bridge is connected, don't fall back to server-side
      // Throw the browser bridge error directly
      throw new Error(`Cannot access "${args.path}" via browser bridge: ${errorMessage}`);
    }
  } else {
    // Server-side fallback (only when browser bridge is NOT connected)
    try {
      const fsEntries = await fileSystem.list(args.path, context, args.depth || 0);
      entries = fsEntries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        size: entry.size,
        mtime: entry.mtime?.toISOString(),
      }));
    } catch (error) {
      throw error;
    }
  }

  // Sort: directories first, then files, alphabetically within each group
  const sorted = entries.sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1;
    if (a.kind !== 'directory' && b.kind === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  // Group by type for better organization
  const directories = sorted.filter(e => e.kind === 'directory');
  const files = sorted.filter(e => e.kind !== 'directory');

  // Build markdown table
  let output = `## Directory Listing: ${args.path}\n\n`;
  output += `**Total:** ${directories.length} directories, ${files.length} files\n\n`;

  if (directories.length > 0) {
    output += `### Directories\n\n`;
    output += `| Name | Path | Modified |\n`;
    output += `|------|------|----------|\n`;
    for (const dir of directories) {
      output += `| 📁 **${dir.name}** | ${dir.path} | ${formatDate(dir.mtime)} |\n`;
    }
    output += `\n`;
  }

  if (files.length > 0) {
    output += `### Files\n\n`;
    output += `| Name | Path | Size | Modified |\n`;
    output += `|------|------|------|----------|\n`;
    for (const file of files) {
      const ext = file.name.split('.').pop() || '';
      const icon = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? '📄' :
                   ['json', 'yaml', 'yml'].includes(ext) ? '⚙️' :
                   ['md', 'txt'].includes(ext) ? '📝' :
                   ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext) ? '🖼️' : '📄';
      output += `| ${icon} ${file.name} | ${file.path} | ${formatFileSize(file.size)} | ${formatDate(file.mtime)} |\n`;
    }
  }

  if (directories.length === 0 && files.length === 0) {
    output += `*Empty directory*\n`;
  }

  return {
    _formatted: true, // Flag to indicate this is pre-formatted
    content: output,
    directories: directories.length,
    files: files.length,
    total: entries.length,
  };
}

/**
 * Handle fs.move tool call
 */
export async function handleFsMove(
  args: { source: string; destination: string; createDestDirs?: boolean },
  context: UserContext
) {
  await fileSystem.move(
    args.source,
    args.destination,
    context,
    args.createDestDirs ?? true
  );
  return { success: true };
}

/**
 * Handle fs.read tool call
 * Uses browser bridge if connected, otherwise falls back to server-side
 */
export async function handleFsRead(
  args: { path: string; encoding?: BufferEncoding },
  context: UserContext
) {
  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    try {
      logger.debug('Using browser bridge for fs.read', { userId: context.userId, path: args.path });
      const result = await bridgeManager.requestBrowserOperation(
        context.userId,
        'fs.read',
        { path: args.path }
      ) as { content: string };
      
      return { content: result.content };
    } catch (error) {
      logger.warn('Browser bridge failed, falling back to server-side', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fall through to server-side implementation
    }
  }

  // Server-side fallback
  const content = await fileSystem.read(
    args.path,
    context,
    args.encoding || "utf8"
  );
  return { content };
}

/**
 * Handle fs.write tool call
 * Uses browser bridge if connected, otherwise falls back to server-side
 */
export async function handleFsWrite(
  args: {
    path: string;
    content: string;
    createDirs?: boolean;
    encoding?: BufferEncoding;
  },
  context: UserContext
) {
  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    try {
      logger.debug('Using browser bridge for fs.write', { userId: context.userId, path: args.path });
      await bridgeManager.requestBrowserOperation(
        context.userId,
        'fs.write',
        { path: args.path, content: args.content }
      );
      
      return { success: true };
    } catch (error) {
      logger.warn('Browser bridge failed, falling back to server-side', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fall through to server-side implementation
    }
  }

  // Server-side fallback
  await fileSystem.write(
    args.path,
    args.content,
    context,
    args.createDirs ?? true,
    args.encoding || "utf8"
  );
  return { success: true };
}

/**
 * Handle fs.delete tool call
 */
export async function handleFsDelete(
  args: { path: string; recursive?: boolean },
  context: UserContext
) {
  await fileSystem.delete(args.path, context, args.recursive ?? false);
  return { success: true };
}

/**
 * Handle fs.copy tool call
 */
export async function handleFsCopy(
  args: {
    source: string;
    destination: string;
    createDestDirs?: boolean;
    recursive?: boolean;
  },
  context: UserContext
) {
  await fileSystem.copy(
    args.source,
    args.destination,
    context,
    args.createDestDirs ?? true,
    args.recursive ?? false
  );
  return { success: true };
}

/**
 * Handle fs.create tool call
 */
export async function handleFsCreate(
  args: { path: string; recursive?: boolean },
  context: UserContext
) {
  await fileSystem.create(args.path, context, args.recursive ?? true);
  return { success: true };
}

