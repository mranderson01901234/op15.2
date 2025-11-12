import type { FileSystem } from "@/lib/storage/interface";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import type { UserContext } from "@/lib/types/user-context";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

const fileSystem: FileSystem = new LocalFileSystem();

/**
 * Handle fs.list tool call
 * Uses browser bridge if connected, otherwise falls back to server-side
 */
export async function handleFsList(
  args: { path: string; depth?: number },
  context: UserContext
) {
  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    try {
      logger.debug('Using browser bridge for fs.list', { userId: context.userId, path: args.path });
      const result = await bridgeManager.requestBrowserOperation(
        context.userId,
        'fs.list',
        { path: args.path || '.' }
      ) as Array<{ name: string; kind: string; path: string }>;
      
      // Transform browser bridge response to match expected format
      return result.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        size: undefined, // Browser API doesn't provide size
        mtime: undefined, // Browser API doesn't provide mtime
      }));
    } catch (error) {
      logger.warn('Browser bridge failed, falling back to server-side', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fall through to server-side implementation
    }
  }

  // Server-side fallback
  const entries = await fileSystem.list(args.path, context, args.depth || 0);
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    mtime: entry.mtime?.toISOString(),
  }));
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

