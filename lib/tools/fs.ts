import type { UserContext } from "@/lib/types/user-context";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

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
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
 * Returns formatted markdown table for better readability
 */
export async function handleFsList(
  args: { path: string; depth?: number },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing fs.list to agent', {
      userId: context.userId,
      path: args.path,
      depth: args.depth || 0,
    });

    // Route to user's local agent (HTTP-first, falls back to WebSocket)
    const fsEntries = await bridgeManager.requestBrowserOperation(
      context.userId,
      'fs.list',
      {
        path: args.path,
        depth: args.depth || 0,
      }
    ) as Array<{ name: string; path: string; kind: string; size?: number; mtime?: string }>;

    logger.debug('Agent fs.list completed', {
      userId: context.userId,
      path: args.path,
      entriesCount: fsEntries.length,
    });

    const entries = fsEntries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      size: entry.size,
      mtime: entry.mtime,
    }));

    // Sort: directories first, then files, alphabetically within each group
    const sorted = entries.sort((a, b) => {
      if (a.kind === 'directory' && b.kind !== 'directory') return -1;
      if (a.kind !== 'directory' && b.kind === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    // Group by type for better organization
    const directories = sorted.filter(e => e.kind === 'directory');
    const files = sorted.filter(e => e.kind !== 'directory');

    // Build combined table with directories and files together
    let output = '';

    if (sorted.length > 0) {
      output += `| Name | Path | Type | Size | Modified |\n`;
      output += `|------|------|------|------|----------|\n`;

      // Add directories first
      for (const dir of directories) {
        output += `| 📁 **${dir.name}** | ${dir.path} | Directory | - | ${formatDate(dir.mtime)} |\n`;
      }

      // Add files after directories
      for (const file of files) {
        const ext = file.name.split('.').pop() || '';
        const icon = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? '📄' :
                     ['json', 'yaml', 'yml'].includes(ext) ? '⚙️' :
                     ['md', 'txt'].includes(ext) ? '📝' :
                     ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext) ? '🖼️' : '📄';
        output += `| ${icon} ${file.name} | ${file.path} | File | ${formatFileSize(file.size)} | ${formatDate(file.mtime)} |\n`;
      }
      output += `\n`;
    } else {
      output += `*Empty directory*\n`;
    }

    return {
      _formatted: true, // Flag to indicate this is pre-formatted
      content: output,
      directories: directories.length,
      files: files.length,
      total: entries.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent fs.list failed', undefined, {
      userId: context.userId,
      path: args.path,
      error: errorMessage,
    });

    // Check if it's a connection error
    if (errorMessage.includes('not connected') || errorMessage.includes('not registered') || errorMessage.includes('Agent HTTP API failed')) {
      throw new Error(
        "⚠️ Local agent required but not connected.\n\n" +
        "To list files, you must:\n" +
        "1. Install the local agent (click 'Install Local Agent' in sidebar)\n" +
        "2. Run the installer you downloaded\n" +
        "3. Approve permissions in the sidebar (Agent Permissions panel)\n" +
        "4. Wait for connection confirmation\n\n" +
        "The local agent runs on YOUR machine to access YOUR files.\n" +
        "This ensures complete isolation between users."
      );
    }

    throw new Error(
      `❌ Failed to list files: ${errorMessage}\n\n` +
      "Please check that:\n" +
      "1. Your local agent is running\n" +
      "2. Permissions are approved (check sidebar)\n" +
      "3. The path exists and is accessible\n" +
      "4. You have permission to access this directory"
    );
  }
}

/**
 * Handle fs.read tool call
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
 */
export async function handleFsRead(
  args: { path: string; encoding?: BufferEncoding },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing fs.read to agent', {
      userId: context.userId,
      path: args.path,
    });

    const result = await bridgeManager.requestBrowserOperation(
      context.userId,
      'fs.read',
      {
        path: args.path,
        encoding: args.encoding || 'utf8',
      }
    ) as { content: string };

    return { content: result.content };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent fs.read failed', undefined, {
      userId: context.userId,
      path: args.path,
      error: errorMessage,
    });

    if (errorMessage.includes('not connected') || errorMessage.includes('not registered') || errorMessage.includes('Agent HTTP API failed')) {
      throw new Error(
        "⚠️ Local agent required but not connected.\n\n" +
        "Please install the local agent and approve permissions to read files."
      );
    }

    throw new Error(
      `❌ Failed to read file: ${errorMessage}\n\n` +
      "Please check that:\n" +
      "1. Your local agent is running\n" +
      "2. Permissions are approved\n" +
      "3. The file exists and you have read permissions."
    );
  }
}

/**
 * Handle fs.write tool call
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
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
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing fs.write to agent', {
      userId: context.userId,
      path: args.path,
      contentLength: args.content.length,
    });

    await bridgeManager.requestBrowserOperation(
      context.userId,
      'fs.write',
      {
        path: args.path,
        content: args.content,
        createDirs: args.createDirs ?? true,
        encoding: args.encoding || 'utf8',
      }
    );

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent fs.write failed', undefined, {
      userId: context.userId,
      path: args.path,
      error: errorMessage,
    });

    throw new Error(
      `❌ Failed to write file: ${errorMessage}\n\n` +
      "Please check that you have write permissions for this location."
    );
  }
}

/**
 * Handle fs.delete tool call
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
 */
export async function handleFsDelete(
  args: { path: string; recursive?: boolean },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing fs.delete to agent', {
      userId: context.userId,
      path: args.path,
      recursive: args.recursive ?? false,
    });

    await bridgeManager.requestBrowserOperation(
      context.userId,
      'fs.delete',
      {
        path: args.path,
        recursive: args.recursive ?? false,
      }
    );

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent fs.delete failed', undefined, {
      userId: context.userId,
      path: args.path,
      error: errorMessage,
    });

    throw new Error(
      `❌ Failed to delete: ${errorMessage}\n\n` +
      "Please check that the path exists and you have delete permissions."
    );
  }
}

/**
 * Handle fs.move tool call
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
 */
export async function handleFsMove(
  args: { source: string; destination: string; createDestDirs?: boolean },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing fs.move to agent', {
      userId: context.userId,
      source: args.source,
      destination: args.destination,
    });

    await bridgeManager.requestBrowserOperation(
      context.userId,
      'fs.move',
      {
        source: args.source,
        destination: args.destination,
        createDestDirs: args.createDestDirs ?? true,
      }
    );

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent fs.move failed', undefined, {
      userId: context.userId,
      source: args.source,
      destination: args.destination,
      error: errorMessage,
    });

    throw new Error(
      `❌ Failed to move file: ${errorMessage}\n\n` +
      "Please check that the source exists and destination is writable."
    );
  }
}

/**
 * Handle fs.copy tool call
 * NOTE: fs.copy is not implemented in local agent yet
 * This will need to be added to local-agent/index.ts
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
  const bridgeManager = getBridgeManager();

  // TODO: Implement fs.copy in local-agent/index.ts
  throw new Error(
    "❌ fs.copy is not yet implemented in the local agent.\n\n" +
    "This operation will be available in a future update."
  );
}

/**
 * Handle fs.create tool call
 * Creates directory using fs.write with empty content
 * (Local agent implements directory creation via fs.write with createDirs: true)
 */
export async function handleFsCreate(
  args: { path: string; recursive?: boolean },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  // For directory creation, we can use fs.write with a temporary file
  // or just use mkdir functionality if needed
  // For now, return not implemented as agent needs mkdir support
  throw new Error(
    "❌ fs.create (mkdir) is not yet implemented in the local agent.\n\n" +
    "Use fs.write to create files in new directories (with createDirs: true)."
  );
}

