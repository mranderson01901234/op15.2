import type { FileSystem } from "@/lib/storage/interface";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import type { UserContext } from "@/lib/types/user-context";

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
 * Uses local agent if connected, otherwise falls back to server-side
 * Returns formatted markdown table for better readability
 */
export async function handleFsList(
  args: { path: string; depth?: number },
  context: UserContext
) {
  // Use server-side filesystem (which will use agent if connected)
  const fsEntries = await fileSystem.list(args.path, context, args.depth || 0);
  const entries = fsEntries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    mtime: entry.mtime?.toISOString(),
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
 * Uses local agent if connected, otherwise falls back to server-side
 */
export async function handleFsRead(
  args: { path: string; encoding?: BufferEncoding },
  context: UserContext
) {
  // Use server-side filesystem (which will use agent if connected)
  const content = await fileSystem.read(
    args.path,
    context,
    args.encoding || "utf8"
  );
  return { content };
}

/**
 * Handle fs.write tool call
 * Uses local agent if connected, otherwise falls back to server-side
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
  // Use server-side filesystem (which will use agent if connected)
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

