# Complete User Flow Audit

## New User Account Creation & Usage Flow

### Step 1: User Signs Up

```
User visits website
  ↓
Clerk authentication
  ↓
User ID generated (e.g., user_2abc123...)
  ↓
✅ User account created
```

**Status**: ✅ Working correctly

---

### Step 2: User Accesses Application

```
User logs in
  ↓
app/page.tsx renders
  ↓
User sees chat interface
  ↓
✅ User can start chatting
```

**Status**: ✅ Working correctly

---

### Step 3: User Enables Local Environment (Optional)

```
User clicks "Enable Local Environment" toggle
  ↓
hooks/use-local-env-enabled.ts
  ↓
Local storage: op15-local-env-enabled = true
  ↓
✅ Local environment UI appears
```

**Status**: ✅ Working correctly

---

### Step 4: User Installs Local Agent (Optional)

```
User clicks "Install Local Agent"
  ↓
components/local-env/agent-auto-installer.tsx
  ↓
Downloads installer from /api/agent/download
  ↓
User runs installer on local machine
  ↓
local-agent/index.ts starts
  ↓
Connects to: ws://server/api/bridge?userId={userId}&type=agent
  ↓
server.js accepts connection
  ↓
agents.set(userId, ws) // ✅ Agent stored
  ↓
Agent sends metadata: { homeDirectory: '/home/user', ... }
  ↓
global.agentMetadata.set(userId, {...}) // ✅ Metadata stored
  ↓
✅ Agent connected and ready
```

**Status**: ✅ Working correctly - Agent connects successfully

---

### Step 5: User Asks "What is my information?"

```
User types: "what is my information"
  ↓
POST /api/chat
  ↓
app/api/chat/route.ts:42
  ↓
Creates UserContext:
  {
    userId: authenticatedUserId,
    browserBridgeConnected: false, // ❌ HARDCODED
    workspaceRoot: '/',
    ...
  }
  ↓
LLM processes message
  ↓
LLM calls: exec.run({ command: "uname -a" })
  ↓
lib/tools/handlers.ts:executeTool()
  ↓
Routes to: lib/tools/exec.ts:handleExecRun()
  ↓
Checks: if (context.browserBridgeConnected && bridgeManager.isConnected(userId))
  ↓
❌ FALSE (browserBridgeConnected is false)
  ↓
Falls back to server-side execution
  ↓
lib/tools/executor.ts:SimpleToolExecutor.execute()
  ↓
spawn("uname -a", { cwd: "/" })
  ↓
Executes on SHARED CLOUD SERVER
  ↓
Returns: "Linux cloud-server 6.14.0-35-generic ..."
  ↓
❌ ALL USERS SEE SAME SYSTEM INFO
```

**Status**: ❌ **BROKEN** - Commands execute on shared server, not user's agent

---

## What Should Happen (Correct Flow)

### Step 5 (Corrected): User Asks "What is my information?"

```
User types: "what is my information"
  ↓
POST /api/chat
  ↓
app/api/chat/route.ts:42
  ↓
Creates UserContext:
  {
    userId: authenticatedUserId,
    browserBridgeConnected: bridgeManager.isConnected(userId), // ✅ CHECK ACTUAL CONNECTION
    workspaceRoot: '/',
    ...
  }
  ↓
LLM processes message
  ↓
LLM calls: exec.run({ command: "uname -a" })
  ↓
lib/tools/handlers.ts:executeTool()
  ↓
Routes to: lib/tools/exec.ts:handleExecRun()
  ↓
Checks: if (bridgeManager.isConnected(userId)) // ✅ CHECK AGENT CONNECTION
  ↓
✅ TRUE (agent is connected)
  ↓
bridgeManager.requestBrowserOperation(
  userId,
  'exec.run',
  { command: "uname -a", cwd: undefined }
)
  ↓
server.js:requestBrowserOperation()
  ↓
Sends via WebSocket to agent:
  {
    id: "user_123-1234567890-abc",
    operation: "exec.run",
    command: "uname -a"
  }
  ↓
local-agent/index.ts receives message
  ↓
local-agent/index.ts:executeCommand("uname -a")
  ↓
Executes on USER'S LOCAL MACHINE
  ↓
Returns: { exitCode: 0, stdout: "Linux user-machine 5.15.0...", stderr: "" }
  ↓
Sends response via WebSocket
  ↓
server.js receives response
  ↓
Resolves promise with result
  ↓
Returns to chat route
  ↓
✅ USER SEES THEIR OWN SYSTEM INFO
```

**Status**: ⚠️ Infrastructure exists but routing is broken

---

## Comparison: Current vs Expected

### Current Behavior

| User | System | Agent Connected? | Command Executes On | Result |
|------|--------|------------------|---------------------|--------|
| User A | Linux Desktop | ✅ Yes | ❌ Cloud Server | Cloud server info |
| User B | MacBook Pro | ✅ Yes | ❌ Cloud Server | Cloud server info |
| User C | Windows PC | ❌ No | ❌ Cloud Server | Cloud server info |

**Problem**: All users see the same system information from the cloud server.

### Expected Behavior

| User | System | Agent Connected? | Command Executes On | Result |
|------|--------|------------------|---------------------|--------|
| User A | Linux Desktop | ✅ Yes | ✅ User A's Machine | User A's system info |
| User B | MacBook Pro | ✅ Yes | ✅ User B's Machine | User B's system info |
| User C | Windows PC | ❌ No | ⚠️ Cloud Server (limited) | Error or limited info |

**Solution**: Route commands to user's agent when connected.

---

## Code Locations

### Where UserContext is Created

**File**: `app/api/chat/route.ts:109-116`

```typescript
const context: UserContext = {
  userId: authenticatedUserId,
  workspaceId: undefined,
  browserBridgeConnected: false, // ❌ PROBLEM HERE
  workspaceRoot,
  restrictionLevel,
  userHomeDirectory,
};
```

**Fix Needed**:
```typescript
const bridgeManager = getBridgeManager();
const context: UserContext = {
  userId: authenticatedUserId,
  workspaceId: undefined,
  browserBridgeConnected: bridgeManager.isConnected(authenticatedUserId), // ✅ CHECK ACTUAL CONNECTION
  workspaceRoot,
  restrictionLevel,
  userHomeDirectory,
};
```

### Where exec.run Routes Commands

**File**: `lib/tools/exec.ts:16-101`

**Current Logic**:
```typescript
export async function handleExecRun(args, context) {
  const bridgeManager = getBridgeManager();
  
  // Check browser bridge (deprecated, always false)
  if (context.browserBridgeConnected && bridgeManager.isConnected(context.userId)) {
    // This never executes
  }
  
  // Always executes here on shared server
  const result = await executor.execute(args.command, context, { cwd });
  return result;
}
```

**Fix Needed**:
```typescript
export async function handleExecRun(args, context) {
  const bridgeManager = getBridgeManager();
  
  // Check if agent is connected (regardless of browserBridgeConnected flag)
  if (bridgeManager.isConnected(context.userId)) {
    try {
      // Route command to user's local agent
      const result = await bridgeManager.requestBrowserOperation(
        context.userId,
        'exec.run',
        {
          command: args.command,
          cwd: args.cwd || context.workspaceRoot,
          timeoutMs: args.timeoutMs,
        }
      );
      return result;
    } catch (error) {
      logger.warn('Agent execution failed, falling back to server-side', {
        userId: context.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to server-side execution
    }
  }
  
  // Fallback: Execute on server (limited functionality)
  const result = await executor.execute(args.command, context, {
    cwd: args.cwd || context.workspaceRoot,
    timeoutMs: args.timeoutMs,
  });
  return result;
}
```

---

## Testing Scenarios

### Scenario 1: User with Agent Connected

**Setup**:
- User A installs agent
- Agent connects successfully
- User A asks "what is my information"

**Expected**:
- Command routes to User A's local agent
- User A sees their own system information

**Actual**:
- Command executes on cloud server
- User A sees cloud server information

**Status**: ❌ Broken

---

### Scenario 2: User without Agent

**Setup**:
- User B does not install agent
- User B asks "what is my information"

**Expected**:
- Error message: "Please install local agent to execute commands"
- OR limited server-side execution with warning

**Actual**:
- Command executes on cloud server
- User B sees cloud server information

**Status**: ⚠️ Works but not ideal (should show error)

---

### Scenario 3: Multiple Users Simultaneously

**Setup**:
- User A (Linux) with agent connected
- User B (Mac) with agent connected
- Both ask "what is my information" at same time

**Expected**:
- User A sees Linux system info
- User B sees Mac system info
- No cross-contamination

**Actual**:
- Both see cloud server info
- No isolation

**Status**: ❌ Broken

---

## Summary

### What Works ✅

1. User authentication (Clerk)
2. Agent installation and connection
3. WebSocket infrastructure
4. Agent command execution capability

### What's Broken ❌

1. UserContext hardcodes `browserBridgeConnected: false`
2. exec.run never routes to agents
3. All commands execute on shared server
4. No per-user isolation

### Impact 🔴

- **Security**: Users can see each other's system information
- **Privacy**: System details leaked across users
- **Functionality**: Users don't get their own system info
- **User Experience**: Confusing results

### Fix Priority

**CRITICAL** - This affects all users and is a security/privacy issue.

