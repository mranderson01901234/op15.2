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

  // Check if agent is connected
  const isAgentConnected = bridgeManager.isConnected(context.userId);

  if (!isAgentConnected) {
    const errorMessage =
      "⚠️ Local agent required but not connected.\n\n" +
      "To execute commands, you must install and run the local agent:\n" +
      "1. Click 'Enable Local Environment' in the sidebar\n" +
      "2. Download and install the local agent\n" +
      "3. Run the agent with your user ID\n" +
      "4. Wait for connection confirmation\n\n" +
      "The local agent runs on YOUR machine to execute commands in YOUR environment.\n" +
      "This ensures complete isolation between users and accurate system information.";

    logger.error('Agent not connected - refusing to execute on shared server', undefined, {
      userId: context.userId,
      command: args.command,
    });

    throw new Error(errorMessage);
  }

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

