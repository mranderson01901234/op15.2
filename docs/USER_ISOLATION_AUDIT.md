# User Isolation & Server Provisioning Audit

## Executive Summary

**CRITICAL ISSUE**: Different users on different systems are seeing each other's system information when running "what is my information" because:

1. **No per-user server isolation** - All users execute commands on the same shared server
2. **Agent routing is disabled** - The system hardcodes `browserBridgeConnected: false`, preventing agent-based execution
3. **Fallback to shared server** - When agent routing fails (or is disabled), commands execute directly on the cloud server, exposing the same system information to all users

## Current Architecture

### User Account Creation Flow

1. **User signs up** via Clerk authentication (`@clerk/nextjs`)
2. **User ID is generated** by Clerk (e.g., `user_2abc123...`)
3. **No server provisioning** - Users share the same cloud server instance
4. **Agent installation** (optional):
   - User downloads agent installer from `/api/agent/download`
   - Agent connects via WebSocket to `/api/bridge?userId={userId}&type=agent`
   - Agent runs on user's local machine, not on a separate server

### Command Execution Flow

When a user asks "what is my information", the LLM calls `exec.run` with commands like `uname -a`, `hostname`, `whoami`, etc.

**Current Execution Path**:

```
User Request → LLM → exec.run tool call
  ↓
lib/tools/exec.ts:handleExecRun()
  ↓
Check: context.browserBridgeConnected && bridgeManager.isConnected(userId)
  ↓
❌ ALWAYS FALSE (browserBridgeConnected is hardcoded to false)
  ↓
Fallback to server-side execution
  ↓
lib/tools/executor.ts:SimpleToolExecutor.execute()
  ↓
spawn(command) on SHARED CLOUD SERVER
  ↓
All users see the same system information
```

## Root Causes

### 1. Agent Routing Disabled

**File**: `app/api/chat/route.ts:112`

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

**Impact**: The system never attempts to route commands through the user's local agent, even if one is connected.

### 2. No Per-User Server Isolation

**File**: `lib/tools/executor.ts:SimpleToolExecutor`

```typescript
async execute(command: string, context: UserContext, options?: {...}) {
  const cwd = options?.cwd || env.WORKSPACE_ROOT || "/";
  // Executes directly on the cloud server - NO ISOLATION
  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
```

**Impact**: All users execute commands on the same server instance, seeing identical system information.

### 3. Agent Connection Not Used for exec.run

**File**: `lib/tools/exec.ts:handleExecRun()`

The code checks for agent connection but:
- `browserBridgeConnected` is always `false`
- Even if agent is connected, the routing logic is flawed
- Falls back to server-side execution when agent routing fails

**Current Logic**:
```typescript
if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
  // Try browser bridge (deprecated)
  // Then fall back to server-side
}
// Always executes here on shared server
```

### 4. Agent WebSocket Connection Exists But Not Used

**File**: `server.js:124`

Agents DO connect via WebSocket:
```javascript
agents.set(userId, ws); // Agent stored per userId
```

**File**: `local-agent/index.ts:303`

Agents CAN execute commands:
```typescript
case 'exec.run':
  data = await this.executeCommand(request.command!, request.cwd, request.timeoutMs);
  break;
```

**But**: The chat route never routes `exec.run` requests to agents because `browserBridgeConnected` is false.

## Expected Behavior vs Actual Behavior

### Expected (Per-User Isolation)

```
User A (on System A) → Agent A (local) → Commands execute on System A
User B (on System B) → Agent B (local) → Commands execute on System B
```

### Actual (Shared Server)

```
User A → ❌ Agent routing disabled → Shared Cloud Server → System info from cloud server
User B → ❌ Agent routing disabled → Shared Cloud Server → Same system info from cloud server
```

## Files Involved

### Core Execution Flow

1. **`app/api/chat/route.ts`** - Creates UserContext with `browserBridgeConnected: false`
2. **`lib/tools/handlers.ts`** - Routes `exec.run` to handler
3. **`lib/tools/exec.ts`** - Checks for agent connection (always fails)
4. **`lib/tools/executor.ts`** - Executes on shared server

### Agent Connection

1. **`server.js`** - WebSocket server that accepts agent connections
2. **`local-agent/index.ts`** - Local agent that can execute commands
3. **`lib/infrastructure/bridge-manager.ts`** - Manages agent connections
4. **`app/api/users/[userId]/workspace/route.ts`** - Stores user workspace config

### User Context

1. **`lib/types/user-context.ts`** - Defines UserContext interface
2. **`app/api/users/[userId]/workspace/route.ts`** - Returns workspace config

## How Agent Connection Should Work

### Current Agent Connection Flow

1. User downloads agent installer (`/api/agent/download`)
2. Agent runs on user's local machine
3. Agent connects via WebSocket: `ws://server/api/bridge?userId={userId}&type=agent`
4. Server stores connection: `agents.set(userId, ws)`
5. Agent sends metadata: `{ type: 'agent-metadata', homeDirectory: '/home/user', ... }`
6. Server stores metadata: `global.agentMetadata.set(userId, {...})`

### How exec.run Should Route to Agent

**Current (Broken)**:
```typescript
// app/api/chat/route.ts
browserBridgeConnected: false // ❌ Never routes to agent

// lib/tools/exec.ts
if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
  // This never executes
}
// Always falls back to server-side
```

**Should Be**:
```typescript
// Check if agent is connected
if (bridgeManager.isConnected(context.userId)) {
  // Route command to agent via WebSocket
  const result = await bridgeManager.requestBrowserOperation(
    context.userId,
    'exec.run',
    { command: args.command, cwd: args.cwd }
  );
  return result;
}
// Fallback to server-side only if agent not connected
```

## New User Onboarding Process

### Current Process

1. ✅ User signs up via Clerk
2. ✅ User ID generated
3. ❌ No server provisioning
4. ⚠️ User can optionally install local agent
5. ❌ Agent connection not used for exec.run

### What Should Happen

1. ✅ User signs up via Clerk
2. ✅ User ID generated
3. ✅ User installs local agent (required for full functionality)
4. ✅ Agent connects via WebSocket
5. ✅ All `exec.run` commands route to user's local agent
6. ✅ User sees their own system information

## Recommendations

### Immediate Fix (Enable Agent Routing)

1. **Remove hardcoded `browserBridgeConnected: false`**
   - File: `app/api/chat/route.ts:112`
   - Change to: Check if agent is actually connected

2. **Fix exec.run routing**
   - File: `lib/tools/exec.ts:22`
   - Route to agent if connected, regardless of `browserBridgeConnected` flag

3. **Update UserContext creation**
   - Check `bridgeManager.isConnected(userId)` instead of hardcoding false

### Long-term Solution (Per-User Servers)

1. **Docker container per user** (recommended)
   - Spin up isolated container for each user
   - Execute commands in user's container
   - Clean up containers when user disconnects

2. **Sandboxed execution environment**
   - Use gVisor, Firecracker, or similar
   - Isolate file system and process execution
   - Per-user resource limits

3. **Agent-first architecture** (current approach, needs fixing)
   - Require agent installation for full functionality
   - Route all commands to user's local agent
   - Fallback to limited server-side execution only

## Testing Checklist

- [ ] User A installs agent, runs "what is my information" → sees User A's system info
- [ ] User B installs agent, runs "what is my information" → sees User B's system info
- [ ] User A and User B run commands simultaneously → no cross-contamination
- [ ] User without agent → limited functionality or clear error message
- [ ] Agent disconnects → graceful fallback or error message
- [ ] Multiple users with agents → each sees their own system

## Security Implications

### Current Issues

1. **Information Leakage**: Users can see each other's system information
2. **No Isolation**: Commands execute in shared environment
3. **Resource Contention**: All users share same server resources

### Risks

- **Data Leakage**: System information, environment variables, file paths exposed
- **Command Injection**: If one user's command is compromised, affects all users
- **Resource Exhaustion**: One user can consume all server resources

## Conclusion

The application architecture supports per-user isolation via local agents, but the implementation is broken:

1. ✅ Agent connection infrastructure exists
2. ✅ Agents can execute commands locally
3. ❌ Chat route never routes commands to agents
4. ❌ All commands execute on shared server

**Fix Priority**: **CRITICAL** - This is a security and privacy issue that affects all users.

