import { spawn } from "child_process";
import type { ToolExecutor } from "./interface";
import type { UserContext } from "@/lib/types/user-context";
import { ExecutionError } from "@/lib/utils/errors";
import { getEnv } from "@/lib/utils/env";
import { validateCommand } from "./command-validator";
import { logger } from "@/lib/utils/logger";

/**
 * Simple tool executor implementation with command validation
 * Uses whitelist-based validation and runs commands without shell
 * TODO: Upgrade to Docker-based sandboxing for production
 */
export class SimpleToolExecutor implements ToolExecutor {
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
    // Validate command against whitelist and extract command + args
    const { command: cmd, args } = validateCommand(command, context.userId);

    const env = getEnv();
    // Default to workspace root, fallback to process.cwd()
    const cwd = options?.cwd || env.WORKSPACE_ROOT || process.cwd();
    const timeoutMs = options?.timeoutMs || 60000;

    // Log command execution for audit trail
    logger.info('Executing command', {
      userId: context.userId,
      command: cmd,
      argCount: args.length,
      cwd,
      timeout: timeoutMs,
    });

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | null = null;

      // SECURITY: Use shell: false to prevent command injection
      // Commands are executed directly without shell interpretation
      const child = spawn(cmd, args, {
        cwd,
        shell: false, // CRITICAL: Prevents shell injection attacks
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: process.env.PATH, // Ensure command can be found
        },
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

