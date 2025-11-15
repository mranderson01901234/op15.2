import type { ToolExecutor } from "@/lib/tools/interface";
import { SimpleToolExecutor } from "@/lib/tools/executor";
import type { UserContext } from "@/lib/types/user-context";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";
import { logger } from "@/lib/utils/logger";
import { promises as fs } from "fs";
import path from "path";

const executor: ToolExecutor = new SimpleToolExecutor();

/**
 * Handle exec.run tool call
 * Routes commands to user's local agent when connected, otherwise executes on server
 */
export async function handleExecRun(
  args: { command: string; cwd?: string; timeoutMs?: number },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();
  
  // Check if agent is connected (regardless of browserBridgeConnected flag for safety)
  const isAgentConnected = bridgeManager.isConnected(context.userId);
  
  if (isAgentConnected) {
    try {
      logger.debug('Routing exec.run to agent', {
        userId: context.userId,
        command: args.command,
        cwd: args.cwd || context.workspaceRoot,
      });

      // Route command to user's local agent via WebSocket
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
      logger.warn('Agent execution failed, falling back to server-side', {
        userId: context.userId,
        command: args.command,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to server-side execution
    }
  } else {
    logger.debug('No agent connected, executing on server', {
      userId: context.userId,
      command: args.command,
    });
  }

  // Fallback: Execute on server (limited functionality)
  // This happens when:
  // 1. Agent is not connected
  // 2. Agent execution failed
  const cwd = args.cwd || context.workspaceRoot;
  
  const result = await executor.execute(
    args.command,
    context,
    {
      cwd,
      timeoutMs: args.timeoutMs,
    }
  );

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

