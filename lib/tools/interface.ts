import type { UserContext } from "@/lib/types/user-context";

/**
 * ToolExecutor interface - abstracted for easy swapping
 * Current: SimpleToolExecutor
 * Later: SandboxedToolExecutor (Docker workers)
 */
export interface ToolExecutor {
  /**
   * Execute a shell command and stream output
   */
  execute(
    command: string,
    context: UserContext,
    options?: {
      cwd?: string;
      timeoutMs?: number;
      onChunk?: (chunk: string) => void;
    }
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

