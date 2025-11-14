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
 * For browser bridge users: syncs workspace to cloud temp directory, executes, then cleans up
 * For direct server access: executes directly
 */
export async function handleExecRun(
  args: { command: string; cwd?: string; timeoutMs?: number },
  context: UserContext
) {
  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    try {
      logger.debug('Using browser bridge for exec.run', {
        userId: context.userId,
        command: args.command,
      });

      // Request browser to sync workspace
      await bridgeManager.requestBrowserOperation(
        context.userId,
        'exec.run',
        { command: args.command }
      );

      // Wait a moment for sync to complete
      // In production, use a proper queue/event system
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get workspace path from global store (set by /api/workspace/sync)
      let workspacePath: string | undefined;
      if (typeof global !== 'undefined' && (global as any).userWorkspaces) {
        const workspace = (global as any).userWorkspaces.get(context.userId);
        if (workspace) {
          workspacePath = workspace.workspacePath;
        }
      }

      if (workspacePath) {
        logger.info('Executing command in synced workspace', {
          userId: context.userId,
          command: args.command,
          workspacePath,
        });

        const result = await executor.execute(
          args.command,
          context,
          {
            cwd: workspacePath,
            timeoutMs: args.timeoutMs,
          }
        );

        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } else {
        // Workspace not synced yet, return error
        throw new Error('Workspace not synced. The browser bridge is syncing your workspace, please try again in a moment.');
      }
    } catch (error) {
      logger.warn('Browser bridge exec.run failed, falling back to server-side', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fall through to server-side implementation
    }
  }

  // Server-side fallback (direct execution)
  // Use workspaceRoot from context as default cwd if not specified
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

