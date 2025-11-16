# Local Environment Assistant - Complete Audit & Blueprint

**Date:** 2024  
**Purpose:** Comprehensive audit of current implementation, target architecture design, and migration plan for scalable local environment feature.

---

## Table of Contents

1. [Current Implementation Map](#1-current-implementation-map)
2. [Target Blueprint](#2-target-blueprint)
3. [Gap Analysis & Migration Plan](#3-gap-analysis--migration-plan)

---

## 1. Current Implementation Map

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Web App (Next.js)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Custom Server (server.js)                               │   │
│  │  - HTTP Server (port 3000)                               │   │
│  │  - WebSocket Server (/api/bridge)                        │   │
│  │  - Stores agent metadata in global.agentMetadata        │   │
│  │  - Stores WebSocket connections in global.serverAgents    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js API Routes                                      │   │
│  │  - /api/chat (tool execution)                            │   │
│  │  - /api/users/[userId]/agent-status                      │   │
│  │  - /api/agent/download                                   │   │
│  │  - /api/agent/permissions (proxy)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  BridgeManager (lib/infrastructure/bridge-manager.ts)    │   │
│  │  - isConnected() checks WS + HTTP                        │   │
│  │  - requestBrowserOperation() tries HTTP first           │   │
│  │  - Falls back to WebSocket                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ WebSocket (ws://cloud/api/bridge)
                          ↕ HTTP (http://cloud/api/*)
┌─────────────────────────────────────────────────────────────────┐
│                    User's Browser (localhost:3000)              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  UI Components (components/local-env/*)                   │   │
│  │  - LocalEnvConnector                                      │   │
│  │  - AgentAutoInstaller                                     │   │
│  │  - AgentPermissionsPanel                                  │   │
│  │  - AgentConnectionGuide                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Status API (/api/users/[userId]/agent-status)           │   │
│  │  - Checks HTTP API on port 4001                          │   │
│  │  - Checks WebSocket state                                 │   │
│  │  - Returns combined status                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP (http://127.0.0.1:4001/*)
                          ↕ WebSocket (ws://cloud/api/bridge)
┌─────────────────────────────────────────────────────────────────┐
│              Local Agent Daemon (User's Machine)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LocalAgent (local-agent/index.ts)                       │   │
│  │  - HTTP Server (port 4001, 127.0.0.1)                    │   │
│  │    • /status, /logs, /plan/approve, /kill                │   │
│  │    • /execute, /fs/list, /fs/read, /fs/write, etc.       │   │
│  │  - WebSocket Client (connects to cloud)                  │   │
│  │  - Permission enforcement                                │   │
│  │  - Action logging                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Local File System & Command Execution                   │   │
│  │  - fs.list, fs.read, fs.write, fs.delete, fs.move        │   │
│  │  - exec.run (shell commands)                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Communication Paths:**
- **WebSocket:** Agent → Cloud (`ws://cloud/api/bridge`) - Used for initial connection, metadata exchange, optional operations
- **HTTP (Cloud → Agent):** Cloud → Agent (`http://127.0.0.1:4001/*`) - Primary path for operations (more reliable)
- **HTTP (Browser → Cloud):** Browser → Cloud (`http://cloud/api/*`) - UI status checks, permissions, downloads

### 1.2 Component Inventory

| Component | File(s) / Folder(s) | Responsibility | Status |
|-----------|---------------------|----------------|--------|
| **Local Agent Daemon** | `local-agent/index.ts` | Node.js process running on user's machine. Exposes HTTP API (port 4001) and connects to cloud via WebSocket. Executes all file operations and commands. | ✅ Implemented |
| **BridgeManager** | `lib/infrastructure/bridge-manager.ts` | Routes tool calls from cloud to agent. Checks connection status. Prefers HTTP API, falls back to WebSocket. | ⚠️ Partially broken |
| **Agent HTTP Client** | `lib/infrastructure/agent-http-client.ts` | Client wrapper for agent's HTTP API. Handles all operation types. | ✅ Implemented |
| **Custom Server** | `server.js` | Next.js custom server with WebSocket support. Handles `/api/bridge` upgrades. Stores agent metadata and connections. | ⚠️ WebSocket unstable |
| **Agent Installer** | `app/api/agent/download/route.ts` | Serves platform-specific installer scripts/binaries. Pre-configures with server URL and user ID. | ✅ Implemented |
| **Status API** | `app/api/users/[userId]/agent-status/route.ts` | Checks agent connection status. Tests HTTP API availability. Returns combined status. | ✅ Implemented |
| **Permissions Proxy** | `app/api/agent/permissions/route.ts` | Proxies permission requests to agent HTTP API (avoids CORS). | ✅ Implemented |
| **Tool Handlers** | `lib/tools/fs.ts`, `lib/tools/exec.ts` | Execute tool calls. Check `isConnected()` before routing to agent. | ⚠️ Early check blocks HTTP |
| **UI - Connector** | `components/local-env/local-env-connector.tsx` | Main container component. Shows connection guide, permissions panel, installer. | ✅ Implemented |
| **UI - Auto Installer** | `components/local-env/agent-auto-installer.tsx` | Shows install/download buttons. Checks connection status. | ✅ Implemented |
| **UI - Permissions Panel** | `components/local-env/agent-permissions-panel.tsx` | Shows permission approval buttons. Displays current permissions. | ✅ Implemented |
| **UI - Connection Guide** | `components/local-env/agent-connection-guide.tsx` | Shows instructions when agent not connected. Copy-to-clipboard command. | ✅ Implemented |

### 1.3 End-to-End Flow (Current Implementation)

#### Flow 1: User Enables Local Environment

```
1. User clicks "Enable Local Environment" toggle
   → LocalEnvToggle component sets localStorage flag
   → LocalEnvConnector renders

2. UI checks agent status
   → AgentAutoInstaller calls /api/users/[userId]/agent-status
   → Status API checks:
     - WebSocket connection (via BridgeManager)
     - Metadata presence (global.agentMetadata)
     - HTTP API availability (fetch http://127.0.0.1:4001/status)

3. If not connected:
   → Shows "Install Local Agent" button
   → User clicks → Opens InstallAgentModal
   → Downloads installer script/binary from /api/agent/download
   → User runs installer manually

4. Installer flow (manual):
   → User runs: cd local-agent && pnpm build && node dist/index.js http://localhost:3000 USER_ID
   → Agent starts HTTP server on port 4001
   → Agent connects WebSocket to ws://localhost:3000/api/bridge
   → Agent sends metadata (homeDirectory, platform, httpPort)
   → Server stores metadata in global.agentMetadata
   → WebSocket may close with 1006 (Next.js dev mode issue)
   → HTTP API remains available

5. UI detects connection:
   → Status API returns { connected: true, httpApiAvailable: true }
   → AgentPermissionsPanel appears
   → User clicks "Balanced" or "Unrestricted"
   → POST /api/agent/permissions → Proxies to agent HTTP API
   → Agent sets sessionPermissions
```

#### Flow 2: Tool Call Execution (e.g., "list files")

```
1. User types "list files" in chat
   → POST /api/chat with message

2. Chat route processes:
   → Gets user context
   → Calls bridgeManager.isConnected(userId)
     → Checks WebSocket state (may be closed)
     → Checks HTTP API availability (via metadata.httpPort)
     → Returns true if HTTP API available

3. LLM generates tool call:
   → { name: "fs.list", args: { path: "/" } }

4. Tool handler executes:
   → handleFsList() called
   → Checks bridgeManager.isConnected() AGAIN
     → ⚠️ BUG: This check may fail if WebSocket closed
   → Calls bridgeManager.requestBrowserOperation("fs.list", args)
     → Tries HTTP API first (AgentHttpClient)
     → Falls back to WebSocket if HTTP fails
     → Returns result

5. Result formatted and returned:
   → Formatted markdown table
   → Streamed back to user
```

### 1.4 Connectivity Semantics (Current Implementation)

#### `BridgeManager.isConnected()` Logic

**Current Implementation:**
```typescript
isConnected(userId: string): boolean {
  // Check WebSocket state
  const bridge = this.bridges.get(userId);
  const isBridgeConnected = bridge?.readyState === 1;
  
  // Check server.js agents
  if (global.serverAgents?.get(userId)?.readyState === 1) {
    return true;
  }
  
  // If WebSocket closed, check HTTP API
  if (!isBridgeConnected) {
    const httpPort = this.getAgentHttpPort(userId);
    if (httpPort) {
      return true; // HTTP API available
    }
  }
  
  return isBridgeConnected;
}
```

**Behavior:**
- ✅ Returns `true` if WebSocket is OPEN
- ✅ Returns `true` if HTTP API port exists in metadata (even if WebSocket closed)
- ⚠️ Does NOT actually test HTTP API liveness (only checks metadata)
- ⚠️ May return `true` even if agent HTTP server crashed

#### HTTP vs WebSocket Choice

**Current Implementation:**
```typescript
async requestBrowserOperation(operation, args) {
  // Try HTTP API first
  const httpPort = this.getAgentHttpPort(userId);
  if (httpPort) {
    try {
      return await AgentHttpClient.executeOperation(...);
    } catch {
      // Fall through to WebSocket
    }
  }
  
  // Fall back to WebSocket
  const bridge = global.serverAgents.get(userId);
  if (bridge?.readyState === 1) {
    // Send via WebSocket
  }
  
  throw new Error("Agent not connected");
}
```

**Behavior:**
- ✅ Prefers HTTP API (more reliable)
- ✅ Falls back to WebSocket if HTTP fails
- ⚠️ No retry logic
- ⚠️ No health check before using HTTP

#### Connection State Scenarios

| Scenario | WebSocket | HTTP API | `isConnected()` | `requestBrowserOperation()` | Result |
|----------|-----------|----------|-----------------|------------------------------|--------|
| **Both up** | ✅ OPEN | ✅ 200 OK | `true` | Uses HTTP | ✅ Works |
| **WS closed, HTTP up** | ❌ Closed (1006) | ✅ 200 OK | `true` (checks metadata) | Uses HTTP | ✅ Works |
| **WS open, HTTP down** | ✅ OPEN | ❌ Not responding | `true` | Falls back to WS | ✅ Works |
| **Both down** | ❌ Closed | ❌ Not responding | `false` | Throws error | ❌ Fails |
| **Metadata missing** | ❌ Closed | ✅ 200 OK | `false` (no httpPort) | Throws error | ❌ Fails |

**Critical Issues:**
1. **Metadata dependency:** `isConnected()` relies on metadata being stored. If WebSocket closes before metadata is stored, HTTP API won't be detected.
2. **No health check:** `isConnected()` doesn't actually test HTTP API, only checks if port exists in metadata.
3. **Race condition:** If WebSocket closes immediately after connection, metadata might not be stored yet.

---

## 2. Target Blueprint

### 2.1 Target Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Web App (Next.js)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Routes (Stateless)                                  │   │
│  │  - /api/chat                                             │   │
│  │  - /api/agent/status (health check)                      │   │
│  │  - /api/agent/install                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Registry (Database/Cache)                         │   │
│  │  - userId → { httpPort, lastSeen, status }               │   │
│  │  - Fast lookup, no global state                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Client (lib/infrastructure/agent-client.ts)       │   │
│  │  - getConnectionStatus(userId) → ConnectionStatus         │   │
│  │  - executeOperation(userId, operation, args)              │   │
│  │  - Handles HTTP + WS transparently                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP (primary)
                          ↕ WebSocket (optional, for real-time)
┌─────────────────────────────────────────────────────────────────┐
│                    User's Browser                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Unified Status Component                                 │   │
│  │  - Shows ConnectionStatus enum                           │   │
│  │  - One-click install/connect                              │   │
│  │  - Clear error messages                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP (http://127.0.0.1:4001/*)
┌─────────────────────────────────────────────────────────────────┐
│              Local Agent Daemon (Standalone)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTTP API (port 4001, 127.0.0.1)                        │   │
│  │  - /health (fast, lightweight)                          │   │
│  │  - /status (detailed)                                    │   │
│  │  - /operations/* (all tool operations)                  │   │
│  │  - /permissions (approve/revoke)                         │   │
│  │  - /kill (emergency stop)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Permission Engine                                        │   │
│  │  - Enforces Safe/Balanced/Unrestricted modes             │   │
│  │  - Directory whitelisting                                 │   │
│  │  - Operation whitelisting                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Audit Logger                                            │   │
│  │  - All operations logged                                  │   │
│  │  - Exposed via /logs                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Local File System & Command Execution                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Differences from Current:**
1. **No WebSocket dependency:** HTTP API is primary and sufficient. WebSocket is optional for real-time features.
2. **Stateless cloud:** No global state (`global.agentMetadata`). Use database/cache for agent registry.
3. **Explicit health checks:** `/health` endpoint for fast liveness checks.
4. **Unified status model:** Clear `ConnectionStatus` enum, not boolean flags.

### 2.2 Connection State Model

```typescript
/**
 * Explicit connection status enum
 * Replaces boolean flags and ad-hoc checks
 */
type ConnectionStatus = 
  | "none"           // No agent detected
  | "http-only"      // HTTP API available, WebSocket not available
  | "ws-only"        // WebSocket available, HTTP API not available (legacy)
  | "full";          // Both HTTP and WebSocket available

interface ConnectionInfo {
  status: ConnectionStatus;
  httpPort?: number;
  httpHealth: "healthy" | "unhealthy" | "unknown";
  wsState: "connected" | "disconnected" | "unknown";
  lastSeen: number; // Timestamp
  metadata?: {
    homeDirectory: string;
    platform: string;
    hasPermissions: boolean;
    mode: 'safe' | 'balanced' | 'unrestricted' | null;
  };
}

/**
 * Feature requirements by status
 */
const FEATURE_REQUIREMENTS = {
  "none": {
    available: [],
    unavailable: ["fs.list", "fs.read", "fs.write", "exec.run", "permissions"],
  },
  "http-only": {
    available: ["fs.list", "fs.read", "fs.write", "exec.run", "permissions", "logs"],
    unavailable: ["real-time-notifications"], // Would need WebSocket
  },
  "ws-only": {
    available: ["fs.list", "fs.read", "fs.write", "exec.run"], // Legacy support
    unavailable: ["permissions", "logs"], // HTTP-only features
  },
  "full": {
    available: ["all"],
    unavailable: [],
  },
} as const;
```

**Health Check Logic:**
```typescript
async function checkAgentHealth(userId: string): Promise<ConnectionInfo> {
  // 1. Check HTTP API (primary)
  const httpPort = await getAgentHttpPort(userId); // From registry
  let httpHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  
  if (httpPort) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`, {
        signal: AbortSignal.timeout(1000), // Fast check
      });
      httpHealth = response.ok ? "healthy" : "unhealthy";
    } catch {
      httpHealth = "unhealthy";
    }
  }
  
  // 2. Check WebSocket (optional)
  const wsState = bridgeManager.isWebSocketConnected(userId) 
    ? "connected" 
    : "disconnected";
  
  // 3. Determine status
  const status: ConnectionStatus = 
    httpHealth === "healthy" && wsState === "connected" ? "full" :
    httpHealth === "healthy" ? "http-only" :
    wsState === "connected" ? "ws-only" :
    "none";
  
  return {
    status,
    httpPort,
    httpHealth,
    wsState,
    lastSeen: Date.now(),
  };
}
```

**UI Display Logic:**
```typescript
function getStatusDisplay(status: ConnectionStatus) {
  switch (status) {
    case "none":
      return { 
        text: "Not Connected", 
        color: "gray",
        icon: "❌",
        action: "Install Agent"
      };
    case "http-only":
      return { 
        text: "Connected (HTTP)", 
        color: "green",
        icon: "✅",
        action: null // Already connected
      };
    case "ws-only":
      return { 
        text: "Connected (Legacy)", 
        color: "yellow",
        icon: "⚠️",
        action: "Upgrade to HTTP"
      };
    case "full":
      return { 
        text: "Connected (Full)", 
        color: "green",
        icon: "✅",
        action: null
      };
  }
}
```

### 2.3 Install / Connect UX Blueprint

#### Target Flow: 1-2 Click Install

**Step 1: User clicks "Enable Local Environment"**
- Toggle switches ON
- System checks for existing agent:
  - Tests `http://127.0.0.1:4001/health` (fast, 1s timeout)
  - If healthy → Status: "http-only" or "full" → Show "Connected"
  - If unhealthy → Show install flow

**Step 2a: Agent Already Running (1 click)**
- UI detects agent via health check
- Shows "Connected" status
- User can immediately use features (after approving permissions)

**Step 2b: Agent Not Running (2 clicks)**
- Click 1: "Install Agent" button
  - Downloads platform-specific installer
  - Auto-detects OS (Linux/Mac/Windows)
  - Pre-configures with server URL and user ID
- Click 2: User runs installer (or double-clicks)
  - Installer:
    1. Builds agent (`pnpm build` in `local-agent/`)
    2. Starts agent (`node dist/index.js SERVER_URL USER_ID`)
    3. Agent connects and sends metadata
    4. UI detects connection via health check
    5. Shows "Connected" status

**Step 3: Permission Approval (1 click)**
- After connection detected, show permission panel
- User clicks "Balanced" (or Safe/Unrestricted)
- Permissions set via HTTP API
- Features immediately available

**Total Clicks:**
- **Best case:** 2 clicks (Enable → Approve permissions)
- **Worst case:** 3 clicks (Enable → Install → Approve)

#### Error Handling

**Clear Error States:**
- "Agent not found" → Show install button
- "Agent not responding" → Show "Restart Agent" button
- "Permission denied" → Show "Approve Permissions" button
- "Connection lost" → Auto-retry health check, show reconnection status

**No Silent Failures:**
- Every error state has a clear action
- No "connected" status when agent is actually down
- Health checks are fast and cached (1s timeout, 5s cache)

### 2.4 Permission / Safety Model

#### Modes

```typescript
type PermissionMode = 'safe' | 'balanced' | 'unrestricted';

interface PermissionConfig {
  mode: PermissionMode;
  allowedDirectories: string[];      // Whitelist (empty = all in unrestricted)
  allowedOperations: OperationType[]; // Whitelist
  approvedPlan?: PlanStep[];          // Optional: pre-approved operations
}

type OperationType = 'read' | 'write' | 'delete' | 'exec';
```

**Mode Semantics:**

1. **Safe Mode:**
   - Operations: `read` only
   - Directories: User home directory (read-only)
   - Use case: Browsing files, reading code
   - No confirmation needed for reads

2. **Balanced Mode:**
   - Operations: `read`, `write`, `exec`
   - Directories: Whitelist (e.g., `~/Desktop`, `~/Documents`, `~/Projects`, `/tmp`)
   - Use case: Development work, file editing, running commands
   - Confirmation for destructive operations (`delete`, `git push --force`)

3. **Unrestricted Mode:**
   - Operations: All (`read`, `write`, `delete`, `exec`)
   - Directories: All (no restrictions)
   - Use case: Full system access
   - ⚠️ Warning: "You are giving this app full control over your machine"
   - Still fully logged

#### Enforcement Location

**All enforcement happens in the agent daemon, NOT in the cloud app.**

```typescript
// In local-agent/index.ts
private checkPermission(request: BridgeRequest): { allowed: boolean; reason?: string } {
  // 1. Check if shutting down
  if (this.isShuttingDown) {
    return { allowed: false, reason: 'Agent is shutting down' };
  }
  
  // 2. Check if permissions set
  if (!this.sessionPermissions) {
    // Default: safe mode (read-only)
    if (request.operation === 'fs.list' || request.operation === 'fs.read') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'No permissions approved' };
  }
  
  // 3. Check mode
  const { mode, allowedOperations, allowedDirectories } = this.sessionPermissions;
  
  if (mode === 'unrestricted') {
    return { allowed: true }; // Still logged
  }
  
  if (mode === 'safe') {
    if (request.operation === 'fs.list' || request.operation === 'fs.read') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Safe mode: read-only' };
  }
  
  // Balanced mode: check operations and directories
  // ... (implementation)
}
```

**Why in agent:**
- Cloud app cannot be trusted (could be compromised)
- Agent is the security boundary
- Even if cloud sends malicious requests, agent enforces permissions
- Logging happens at agent level (cannot be bypassed)

#### Logging

**All operations logged:**
```typescript
interface ActionLog {
  timestamp: number;
  userId: string;
  operation: string;
  path?: string;
  command?: string;
  result: 'success' | 'error' | 'denied';
  details: Record<string, unknown>;
}
```

**Log retention:**
- In-memory: Last 1000 operations
- Exposed via `/logs` endpoint
- Future: Persist to file for audit trail

---

## 3. Gap Analysis & Migration Plan

### 3.1 Gap List

#### Critical Gaps

1. **❌ No explicit `ConnectionStatus` enum**
   - Current: Boolean flags (`connected`, `httpApiAvailable`, `websocketConnected`)
   - Problem: Ambiguous states, inconsistent checks
   - Impact: UI and tools use different logic

2. **❌ No actual HTTP health check**
   - Current: `isConnected()` checks metadata presence, not HTTP liveness
   - Problem: May return `true` even if agent crashed
   - Impact: Tools fail with confusing errors

3. **❌ Global state (`global.agentMetadata`)**
   - Current: Metadata stored in `global.agentMetadata` Map
   - Problem: Not scalable, lost on server restart, race conditions
   - Impact: Connection status unreliable in production

4. **❌ WebSocket instability (1006 errors)**
   - Current: WebSocket closes immediately in Next.js dev mode
   - Problem: Metadata might not be stored before close
   - Impact: Connection detection fails

5. **❌ Multi-step install flow**
   - Current: Download → Manual run → Wait → Approve
   - Problem: Not 1-2 click, requires terminal knowledge
   - Impact: Poor UX, high friction

6. **❌ No `/health` endpoint**
   - Current: Only `/status` (detailed, slow)
   - Problem: Health checks are slow (2s timeout)
   - Impact: UI feels sluggish

#### Moderate Gaps

7. **⚠️ Tool handlers check connection too early**
   - Current: `handleFsList()` checks `isConnected()` before calling `requestBrowserOperation()`
   - Problem: Blocks HTTP API if check fails
   - Impact: Works now (after fix), but fragile

8. **⚠️ Inconsistent status checks**
   - Current: UI uses status API, tools use `BridgeManager.isConnected()`
   - Problem: Different code paths, different results
   - Impact: UI shows "connected" but tools fail

9. **⚠️ No agent registry**
   - Current: Metadata stored in global Map
   - Problem: No persistence, no multi-instance support
   - Impact: Can't scale horizontally

10. **⚠️ Installer requires manual steps**
    - Current: User must run `cd local-agent && pnpm build && node dist/index.js ...`
    - Problem: Too technical, error-prone
    - Impact: High barrier to entry

#### Minor Gaps

11. **📝 No structured error messages**
    - Current: Generic "Agent not connected" errors
    - Problem: Doesn't guide user to fix
    - Impact: User confusion

12. **📝 No connection retry logic**
    - Current: Agent reconnects WebSocket, but no HTTP retry
    - Problem: If HTTP fails once, gives up
    - Impact: Unnecessary failures

13. **📝 No connection state persistence**
    - Current: Status checked on every request
    - Problem: No caching, redundant checks
    - Impact: Performance overhead

### 3.2 Prioritized Migration Plan

#### Phase 1: Clarity and Stability (Week 1)

**Goal:** Make current system reliable and understandable.

**Tasks:**

1. **Implement `ConnectionStatus` enum**
   - Files: `lib/infrastructure/connection-status.ts` (new)
   - Changes:
     - Define `ConnectionStatus` type
     - Create `getConnectionStatus(userId)` function
     - Replace boolean flags with enum
   - Risk: Low (additive change)
   - Expected: Clearer status, consistent checks

2. **Add `/health` endpoint to agent**
   - Files: `local-agent/index.ts`
   - Changes:
     - Add `/health` route (fast, lightweight)
     - Returns `{ status: "ok", timestamp: number }`
   - Risk: Low (new endpoint, doesn't break existing)
   - Expected: Faster health checks (100ms vs 2s)

3. **Implement real HTTP health check**
   - Files: `lib/infrastructure/bridge-manager.ts`, `app/api/users/[userId]/agent-status/route.ts`
   - Changes:
     - `isConnected()` calls `/health` endpoint (not just metadata check)
     - Cache health check results (5s TTL)
   - Risk: Medium (changes core logic)
   - Expected: Accurate connection status

4. **Update UI to show `ConnectionStatus`**
   - Files: `components/local-env/agent-auto-installer.tsx`, `components/local-env/agent-permissions-panel.tsx`
   - Changes:
     - Display status enum (not boolean)
     - Show different UI for "http-only" vs "full"
   - Risk: Low (UI only)
   - Expected: Clearer user feedback

**Success Criteria:**
- ✅ `ConnectionStatus` enum used everywhere
- ✅ Health checks are fast (<200ms)
- ✅ Status is accurate (no false positives)
- ✅ UI shows clear status

---

#### Phase 2: Clean Agent Boundary (Week 2)

**Goal:** Ensure agent is the single owner of operations.

**Tasks:**

1. **Remove early connection checks from tool handlers**
   - Files: `lib/tools/fs.ts`, `lib/tools/exec.ts`
   - Changes:
     - Remove `isConnected()` checks
     - Let `requestBrowserOperation()` handle errors
   - Risk: Low (simplifies code)
   - Expected: More reliable (HTTP API always tried)

2. **Make WebSocket optional**
   - Files: `local-agent/index.ts`, `lib/infrastructure/bridge-manager.ts`
   - Changes:
     - Agent works with HTTP API only
     - WebSocket is for real-time features (future)
   - Risk: Low (HTTP already primary)
   - Expected: More stable (no WS dependency)

3. **Add agent registry (database/cache)**
   - Files: `lib/infrastructure/agent-registry.ts` (new)
   - Changes:
     - Replace `global.agentMetadata` with database/cache
     - Store: `userId → { httpPort, lastSeen, status }`
   - Risk: Medium (requires database setup)
   - Expected: Scalable, persistent

4. **Remove global state dependencies**
   - Files: `server.js`, `lib/infrastructure/bridge-manager.ts`
   - Changes:
     - Remove `global.agentMetadata`
     - Remove `global.serverAgents` (or make it cache-only)
   - Risk: Medium (touches core code)
   - Expected: Cleaner architecture

**Success Criteria:**
- ✅ No global state for agent metadata
- ✅ Agent registry in database/cache
- ✅ WebSocket is optional (HTTP sufficient)
- ✅ Tool handlers don't block HTTP API

---

#### Phase 3: Install / Connect UX (Week 3)

**Goal:** 1-2 click install experience.

**Tasks:**

1. **Auto-detect running agent**
   - Files: `components/local-env/agent-auto-installer.tsx`
   - Changes:
     - On mount, test `http://127.0.0.1:4001/health`
     - If healthy, show "Connected" immediately
   - Risk: Low (additive)
   - Expected: Faster connection detection

2. **Improve installer flow**
   - Files: `app/api/agent/download/route.ts`, `installer-src/*`
   - Changes:
     - Installer auto-starts agent after install
     - No manual `cd` and `node` commands needed
   - Risk: Medium (installer changes)
   - Expected: True 1-click install

3. **Add "Restart Agent" button**
   - Files: `components/local-env/agent-auto-installer.tsx`
   - Changes:
     - If agent unhealthy, show "Restart Agent"
     - Sends signal to agent (or shows instructions)
   - Risk: Low (UI only)
   - Expected: Better error recovery

4. **Structured error messages**
   - Files: `lib/tools/fs.ts`, `lib/tools/exec.ts`
   - Changes:
     - Error messages include `ConnectionStatus`
     - Guide user to fix (e.g., "Click 'Restart Agent'")
   - Risk: Low (error messages only)
   - Expected: Better user experience

**Success Criteria:**
- ✅ Agent auto-detected on page load
- ✅ Installer auto-starts agent
- ✅ Clear error messages with actions
- ✅ 1-2 click install flow

---

### 3.3 Risk Assessment

| Phase | Risk Level | Mitigation |
|-------|------------|------------|
| **Phase 1** | Low-Medium | Additive changes, can roll back easily |
| **Phase 2** | Medium | Requires database setup, test thoroughly |
| **Phase 3** | Low | Mostly UI/UX improvements |

**Rollback Plan:**
- Each phase is independent
- Can deploy incrementally
- Keep old code paths until new ones are stable

---

### 3.4 Expected Behavioral Changes

#### After Phase 1

**Before:**
- Status: Boolean flags, inconsistent
- Health check: 2s timeout, checks metadata only
- UI: "Connected" or "Not Connected"

**After:**
- Status: `ConnectionStatus` enum, consistent
- Health check: 200ms timeout, tests `/health` endpoint
- UI: "Connected (HTTP)", "Connected (Full)", "Not Connected"

#### After Phase 2

**Before:**
- Global state: `global.agentMetadata` Map
- WebSocket: Required for operations
- Tool handlers: Check connection before calling

**After:**
- Agent registry: Database/cache
- WebSocket: Optional (HTTP sufficient)
- Tool handlers: No early checks, always try HTTP

#### After Phase 3

**Before:**
- Install: Download → Manual run → Wait
- Detection: Poll status API every 5s
- Errors: Generic "Agent not connected"

**After:**
- Install: Download → Auto-start → Connected
- Detection: Health check on mount, cached
- Errors: "Agent not responding. Click 'Restart Agent'."

---

## Summary

### Current State

**What Works:**
- ✅ Agent HTTP API (port 4001)
- ✅ HTTP-first operation routing
- ✅ Permission enforcement
- ✅ Action logging
- ✅ UI components

**What's Broken:**
- ❌ No explicit connection status model
- ❌ No real health checks
- ❌ Global state dependencies
- ❌ WebSocket instability
- ❌ Multi-step install flow

### Target State

**Architecture:**
- Clean separation: Agent daemon owns all operations
- Stateless cloud: No global state, database-backed registry
- HTTP-first: WebSocket optional
- Explicit status: `ConnectionStatus` enum

**UX:**
- 1-2 click install
- Auto-detection of running agent
- Clear error messages with actions
- Fast health checks (<200ms)

### Migration Path

**Phase 1 (Week 1):** Clarity and stability
- Add `ConnectionStatus` enum
- Implement `/health` endpoint
- Real health checks
- Update UI

**Phase 2 (Week 2):** Clean agent boundary
- Remove global state
- Add agent registry
- Make WebSocket optional
- Simplify tool handlers

**Phase 3 (Week 3):** Install/connect UX
- Auto-detect agent
- Improve installer
- Better error messages
- 1-2 click flow

**Total Timeline:** 3 weeks for complete migration

---

**Next Steps:**
1. Review this document
2. Approve migration plan
3. Start Phase 1 implementation
4. Test incrementally
5. Deploy phase by phase

