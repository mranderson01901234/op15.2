import type { UserContext } from "@/lib/types/user-context";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";

/**
 * Handle exec.run tool call
 * REQUIRES local agent to be connected - NO SERVER-SIDE EXECUTION
 */
export async function handleExecRun(
  args: { command: string; cwd?: string; timeoutMs?: number },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();

  try {
    logger.debug('Routing exec.run to agent', {
      userId: context.userId,
      command: args.command,
      cwd: args.cwd || context.workspaceRoot,
    });

    // Route command to user's local agent (HTTP-first, falls back to WebSocket)
    // requestBrowserOperation will try HTTP API first, then WebSocket
    // If both fail, it will throw an error with a clear message
    const result = await bridgeManager.requestBrowserOperation(
      context.userId,
      'exec.run',
      {
        command: args.command,
        cwd: args.cwd || context.workspaceRoot,
        timeoutMs: args.timeoutMs,
      }
    ) as { exitCode: number; stdout: string; stderr: string };

    logger.debug('Agent execution completed', {
      userId: context.userId,
      command: args.command,
      exitCode: result.exitCode,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent execution failed', undefined, {
      userId: context.userId,
      command: args.command,
      error: errorMessage,
    });

    throw new Error(
      `❌ Agent execution failed: ${errorMessage}\n\n` +
      "Please check that:\n" +
      "1. Your local agent is running\n" +
      "2. The agent has network connectivity\n" +
      "3. The command is valid for your system\n\n" +
      "If the agent disconnected, restart it to reconnect."
    );
  }
}

