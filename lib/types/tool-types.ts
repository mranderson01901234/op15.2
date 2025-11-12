/**
 * Tool call request from LLM
 */
export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  id?: string;
  name: string;
  result: unknown;
  error?: string;
}

/**
 * File system entry
 */
export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  mtime?: Date;
}

