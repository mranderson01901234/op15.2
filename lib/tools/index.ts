import type { Index, RAGOptions } from "@/lib/index/interface";
import { MemoryIndex } from "@/lib/index/memory-index";
import type { UserContext } from "@/lib/types/user-context";

const index: Index = new MemoryIndex();

/**
 * Handle index.scan tool call
 */
export async function handleIndexScan(
  args: { 
    root: string; 
    maxDepth?: number; 
    followSymlinks?: boolean;
    enableRAG?: boolean;
    storeDisplayName?: string;
    includeExtensions?: string[];
    maxFileSize?: number;
  },
  context: UserContext
) {
  // enableRAG defaults to false (opt-in)
  // Only create ragOptions if RAG is explicitly enabled OR if there are custom options
  const ragOptions: RAGOptions | undefined = 
    args.enableRAG === true || 
    args.storeDisplayName || 
    args.includeExtensions || 
    args.maxFileSize !== undefined
      ? {
          enableRAG: args.enableRAG === true, // Only enable if explicitly set to true
          storeDisplayName: args.storeDisplayName,
          includeExtensions: args.includeExtensions,
          maxFileSize: args.maxFileSize,
        }
      : undefined; // undefined means use defaults (RAG disabled by default)

  const result = await index.scan(
    args.root,
    context,
    args.maxDepth || 4,
    args.followSymlinks || false,
    ragOptions
  );
  
  const message = result.ragStoreName
    ? `Indexed ${result.count} paths and uploaded files to RAG store: ${result.ragStoreName}`
    : `Indexed ${result.count} paths`;
    
  return { 
    count: result.count, 
    message,
    ragStoreName: result.ragStoreName
  };
}

/**
 * Handle index.find tool call
 * Search the index for files matching a query (filename or path)
 */
export async function handleIndexFind(
  args: {
    query: string;
    limit?: number;
  },
  context: UserContext
) {
  const matches = await index.findClosest(
    args.query,
    context,
    args.limit || 10
  );
  
  return {
    matches,
    count: matches.length,
  };
}

