# Required Fixes for User Isolation

## Summary

The application has the infrastructure for per-user isolation via local agents, but the routing logic is broken. Commands execute on a shared cloud server instead of routing to each user's local agent.

## Critical Fixes Required

### Fix 1: Enable Agent Routing in Chat Route

**File**: `app/api/chat/route.ts`

**Current Code** (Line ~112):
```typescript
const context: UserContext = {
  userId: authenticatedUserId,
  workspaceId: undefined,
  browserBridgeConnected: false, // ❌ HARDCODED TO FALSE
  workspaceRoot,
  restrictionLevel,
  userHomeDirectory,
};
```

**Fixed Code**:
```typescript
// Import bridge manager
import { getBridgeManager } from '@/lib/infrastructure/bridge-manager';

// ... existing code ...

// Check if agent is actually connected
const bridgeManager = getBridgeManager();
const isAgentConnected = bridgeManager.isConnected(authenticatedUserId);

const context: UserContext = {
  userId: authenticatedUserId,
  workspaceId: undefined,
  browserBridgeConnected: isAgentConnected, // ✅ CHECK ACTUAL CONNECTION
  workspaceRoot,
  restrictionLevel,
  userHomeDirectory,
};
```

**Impact**: Enables the system to detect when an agent is connected.

---

### Fix 2: Route exec.run Commands to Agent

**File**: `lib/tools/exec.ts`

**Current Code** (Lines 16-101):
```typescript
export async function handleExecRun(
  args: { command: string; cwd?: string; timeoutMs?: number },
  context: UserContext
) {
  // Check if browser bridge is connected
  const bridgeManager = getBridgeManager();
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    // ... browser bridge logic (deprecated) ...
    // Falls back to server-side
  }

  // Server-side fallback (direct execution)
  // ❌ ALWAYS EXECUTES HERE
  const cwd = args.cwd || context.workspaceRoot;
  const result = await executor.execute(args.command, context, {
    cwd,
    timeoutMs: args.timeoutMs,
  });
  return result;
}
```

**Fixed Code**:
```typescript
export async function handleExecRun(
  args: { command: string; cwd?: string; timeoutMs?: number },
  context: UserContext
) {
  const bridgeManager = getBridgeManager();
  
  // Check if agent is connected (regardless of browserBridgeConnected flag)
  if (bridgeManager.isConnected(context.userId)) {
    try {
      logger.debug('Routing exec.run to agent', {
        userId: context.userId,
        command: args.command,
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
      );

      // Agent returns: { exitCode: number, stdout: string, stderr: string }
      return result;
    } catch (error) {
      logger.warn('Agent execution failed, falling back to server-side', {
        userId: context.userId,
        command: args.command,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to server-side execution
    }
  }

  // Fallback: Execute on server (limited functionality or error)
  // This should only happen if:
  // 1. Agent is not connected
  // 2. Agent execution failed
  logger.info('Executing command on server (no agent connection)', {
    userId: context.userId,
    command: args.command,
  });

  const cwd = args.cwd || context.workspaceRoot;
  const result = await executor.execute(args.command, context, {
    cwd,
    timeoutMs: args.timeoutMs,
  });
  
  return result;
}
```

**Impact**: Routes commands to user's local agent when connected, ensuring per-user isolation.

---

## Additional Improvements (Optional)

### Improvement 1: Better Error Messages

When agent is not connected, show a helpful error message:

```typescript
if (!bridgeManager.isConnected(context.userId)) {
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Local agent not connected. Please install and connect your local agent to execute commands on your system.',
  };
}
```

### Improvement 2: Agent Status Check

Add a helper function to check agent status:

```typescript
// lib/utils/agent-status.ts
import { getBridgeManager } from '@/lib/infrastructure/bridge-manager';

export function isAgentConnected(userId: string): boolean {
  const bridgeManager = getBridgeManager();
  return bridgeManager.isConnected(userId);
}

export function getAgentStatus(userId: string): {
  connected: boolean;
  homeDirectory?: string;
  platform?: string;
} {
  const bridgeManager = getBridgeManager();
  const connected = bridgeManager.isConnected(userId);
  
  if (!connected) {
    return { connected: false };
  }
  
  // Get agent metadata
  if (typeof global !== 'undefined' && (global as any).agentMetadata) {
    const metadata = (global as any).agentMetadata.get(userId);
    if (metadata) {
      return {
        connected: true,
        homeDirectory: metadata.homeDirectory,
        platform: metadata.platform,
      };
    }
  }
  
  return { connected: true };
}
```

### Improvement 3: Require Agent for exec.run

Make agent connection required for exec.run:

```typescript
export async function handleExecRun(args, context) {
  const bridgeManager = getBridgeManager();
  
  if (!bridgeManager.isConnected(context.userId)) {
    throw new Error(
      'Local agent not connected. Please install and connect your local agent to execute commands. ' +
      'Visit the sidebar to install the agent.'
    );
  }
  
  // Route to agent...
}
```

---

## Testing Checklist

After applying fixes:

- [ ] User A with agent connected → sees their own system info
- [ ] User B with agent connected → sees their own system info
- [ ] User C without agent → sees error or limited functionality
- [ ] Multiple users simultaneously → no cross-contamination
- [ ] Agent disconnects → graceful error handling
- [ ] Commands like `uname -a`, `hostname`, `whoami` → route to agent

---

## Files to Modify

1. ✅ `app/api/chat/route.ts` - Fix UserContext creation
2. ✅ `lib/tools/exec.ts` - Fix exec.run routing

## Files to Review (No Changes Needed)

- `server.js` - Already handles agent connections correctly
- `local-agent/index.ts` - Already executes commands correctly
- `lib/infrastructure/bridge-manager.ts` - Already manages connections correctly

---

## Verification Steps

1. Apply Fix 1 and Fix 2
2. Start server: `npm run dev`
3. User A: Install agent, connect
4. User A: Ask "what is my information"
5. Verify: User A sees their own system info
6. User B: Install agent, connect
7. User B: Ask "what is my information"
8. Verify: User B sees their own system info (different from User A)
9. Verify: No cross-contamination

---

## Rollback Plan

If issues occur:

1. Revert Fix 1: Change `browserBridgeConnected` back to `false`
2. Revert Fix 2: Remove agent routing logic
3. System returns to current (broken) state

---

## Notes

- The infrastructure for agent routing already exists
- Only the routing logic needs to be enabled
- No new dependencies required
- Backward compatible (falls back to server-side if agent not connected)

