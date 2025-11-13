import { spawn } from "child_process";
import type { ToolExecutor } from "./interface";
import type { UserContext } from "@/lib/types/user-context";
import { ExecutionError } from "@/lib/utils/errors";
import { getEnv } from "@/lib/utils/env";

/**
 * Simple tool executor implementation
 * Executes commands directly on the server
 * Later: Swap with SandboxedToolExecutor for Docker-based isolation
 */
export class SimpleToolExecutor implements ToolExecutor {
  /**
   * Sanitize command to prevent injection attacks
   */
  private sanitizeCommand(command: string): string {
    // Remove dangerous command chaining characters
    const dangerous = [';', '&&', '||', '|', '`', '$', '<', '>', '\n', '\r'];
    let sanitized = command;
    
    for (const char of dangerous) {
      if (sanitized.includes(char)) {
        throw new ExecutionError(
          `Command contains potentially dangerous character: ${char === '\n' ? 'newline' : char === '\r' ? 'carriage return' : char}`,
          command
        );
      }
    }
    
    // Prevent command substitution attempts
    if (sanitized.includes('$(') || sanitized.includes('${')) {
      throw new ExecutionError(
        'Command contains command substitution syntax',
        command
      );
    }
    
    return sanitized;
  }

  async execute(
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
  }> {
    // Sanitize command before execution
    const sanitizedCommand = this.sanitizeCommand(command);
    
    const env = getEnv();
    // Default to "/" (filesystem root) instead of process.cwd() to work with any directory
    const cwd = options?.cwd || env.WORKSPACE_ROOT || "/";
    const timeoutMs = options?.timeoutMs || 60000;

    return new Promise((resolve, reject) => {
      const [cmd, ...args] = sanitizedCommand.split(/\s+/);
      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | null = null;

      const child = spawn(cmd, args, {
        cwd,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        options?.onChunk?.(chunk);
      });

      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        options?.onChunk?.(chunk);
      });

      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(
          new ExecutionError(
            `Failed to execute command: ${command}`,
            command,
            undefined,
            error
          )
        );
      });

      child.on("exit", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        const exitCode = code ?? 1;
        resolve({ exitCode, stdout, stderr });
      });

      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(
          new ExecutionError(
            `Command timed out after ${timeoutMs}ms: ${command}`,
            command,
            undefined
          )
        );
      }, timeoutMs);
    });
  }
}

