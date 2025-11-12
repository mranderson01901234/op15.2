import type { FileSystem } from "@/lib/storage/interface";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import type { UserContext } from "@/lib/types/user-context";

const fileSystem: FileSystem = new LocalFileSystem();

/**
 * Handle editor.open tool call
 * Opens a file in the editor view
 */
export async function handleEditorOpen(
  args: { path: string; encoding?: BufferEncoding },
  context: UserContext
) {
  // Resolve the path to absolute path
  const resolvedPath = await fileSystem.resolve(args.path, context);
  
  // Read the file content
  const content = await fileSystem.read(
    resolvedPath,
    context,
    args.encoding || "utf8"
  );
  
  // Return a special response that signals the API to send an editor_open event
  return {
    success: true,
    path: resolvedPath, // Use resolved absolute path
    content: content,
    _editorOpen: true, // Special flag to trigger editor open in API route
  };
}

