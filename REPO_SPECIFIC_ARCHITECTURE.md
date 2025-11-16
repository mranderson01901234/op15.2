# Local Environment Assistant - Repo-Specific Architecture & Migration Plan

**Date:** 2024  
**Purpose:** Concrete mapping of blueprint concepts to this codebase, target architecture for THIS repo, and phased migration plan.

**Product Requirement:** The local agent must be installable by a non-technical user in **1–2 clicks**: enable toggle → download installer → run. No terminals, no builds, no manual services. Zero requirement for Node, pnpm, or any build tool on end-user machines.

---

## Table of Contents

1. [Blueprint → Codebase Mapping](#1-blueprint--codebase-mapping)
2. [Repo-Specific Target Architecture](#2-repo-specific-target-architecture)
3. [Phased Migration Plan](#3-phased-migration-plan)

---

## 1. Blueprint → Codebase Mapping

### Mapping Table

| Blueprint Concept | Actual Implementation (file/dir) | Notes |
|-------------------|----------------------------------|-------|
| **Local Agent Daemon** | `local-agent/index.ts` | Pure Node.js (not Next.js). Standalone process. HTTP server on port 4001. WebSocket client connects to cloud. |
| **HTTP API** | `local-agent/index.ts` (lines 82-134) | Port 4001, `127.0.0.1`. Endpoints: `/status`, `/logs`, `/plan/approve`, `/kill`, `/execute`, `/fs/list`, `/fs/read`, `/fs/write`, `/fs/delete`, `/fs/move`. **MISSING: `/health` endpoint** |
| **WebSocket Bridge** | `server.js` (lines 43-289) | `/api/bridge` endpoint. Handles upgrades. Stores connections in `global.serverAgents`. **UNSTABLE: 1006 errors in Next.js dev mode** |
| **BridgeManager / Client** | `lib/infrastructure/bridge-manager.ts` | Routes tool calls. `isConnected()` checks metadata (not real health check). `requestBrowserOperation()` tries HTTP first, falls back to WS. |
| **Agent HTTP Client** | `lib/infrastructure/agent-http-client.ts` | Wrapper for agent HTTP API. All operations mapped. Used by `BridgeManager`. |
| **Status API** | `app/api/users/[userId]/agent-status/route.ts` | Checks WebSocket state, metadata, HTTP API (via `/status`, not `/health`). Returns combined boolean flags. **NO `ConnectionStatus` enum** |
| **Permissions Proxy** | `app/api/agent/permissions/route.ts` | Proxies to agent HTTP API (avoids CORS). GET `/status`, POST `/plan/approve`. |
| **Installer / Auto-start** | `app/api/agent/download/route.ts` | Serves **pre-built OS-specific agent installers** (no Node/pnpm required on user machine). Each installer: drops a single agent binary to a stable path, writes `config.json` with `serverUrl`, `userId`, `sharedSecret`, registers the binary as an OS-level user service (systemd user / LaunchAgent / Windows service), starts the service immediately so `/health` is live as soon as installer finishes. |
| **Legacy Dev Installer (to be removed)** | `installer-src/installer.js`, `installer-src/installer-server.js` | **TEMPORARY DEV-ONLY PATH**: Current scripts run `pnpm build` and start agent manually. These assume Node/pnpm on user machine. **WILL BE REMOVED** once CI-built binaries + OS-native installers are in place. |
| **Local Env Toggle** | `components/local-env/local-env-toggle.tsx` | Toggle switch. Auto-downloads installer when enabled. Sets localStorage flag. |
| **Auto Installer UI** | `components/local-env/agent-auto-installer.tsx` | Shows install/download buttons. Polls status API. Shows connection state. |
| **Permissions Panel** | `components/local-env/agent-permissions-panel.tsx` | Shows permission approval buttons (Safe/Balanced/Unrestricted). Displays current permissions. |
| **Connection Guide** | `components/local-env/agent-connection-guide.tsx` | **LEGACY BEHAVIOR (to be removed)**: Currently shows terminal commands like `cd local-agent && pnpm build && node dist/index.js`. In final product, this component **must never** show terminal commands. Should instead show "Install Agent" button when `ConnectionStatus === "none"`. **Any UI copy that suggests the user needs Node, pnpm, or CLI steps is a bug.** |
| **Connector Container** | `components/local-env/local-env-connector.tsx` | Main container. Renders toggle, guide, permissions, installer. |
| **Global State** | `server.js` (lines 171-180) | `global.agentMetadata` Map stores `{ homeDirectory, platform, httpPort }`. `global.serverAgents` Map stores WebSocket connections. **NOT SCALABLE, but acceptable for single-tenant** |

### Critical Mismatches

1. **❌ Blueprint assumes `/health` endpoint; code only has `/status`**
   - Current: `/status` returns full status object (slow, ~2s timeout)
   - Needed: `/health` endpoint for fast liveness checks (<200ms)

2. **❌ Blueprint assumes 1-2 click install with pre-built binaries; code requires manual terminal commands**
   - Current: Download installer → User runs `cd local-agent && pnpm build && node dist/index.js http://localhost:3000 USER_ID`
   - Needed: Download pre-built binary → Installer copies binary + config + service → Auto-start (no build tools, no terminal)

3. **❌ Blueprint assumes `ConnectionStatus` enum; code uses boolean flags**
   - Current: `{ connected: boolean, httpApiAvailable: boolean, websocketConnected: boolean }`
   - Needed: `ConnectionStatus = "none" | "http-only" | "full"`

4. **❌ Blueprint assumes real HTTP health check; code checks metadata only**
   - Current: `isConnected()` checks if `httpPort` exists in metadata
   - Needed: Actually call `/health` endpoint to verify liveness

5. **❌ Blueprint assumes pre-built binaries; code assumes users have Node/pnpm**
   - Current: Installer scripts call `pnpm build` and `node dist/index.js` on user machine
   - Needed: CI/CD builds static binaries, installers just copy binary + config + service

6. **⚠️ Blueprint assumes database registry; code uses global state**
   - Current: `global.agentMetadata` Map (in-memory, lost on restart)
   - Acceptable: For single-tenant, global state is fine. No need for database.

7. **❌ Legacy dev installer scripts assume Node/pnpm on user machine**
   - Current: `installer-src/*` scripts run `pnpm build` and `node dist/index.js` on user machine
   - Needed: **MUST BE REMOVED**. Final product **must never** require `pnpm build` / `node dist/index.js` on end-user devices. Only pre-built binaries + OS-native installers.

8. **⚠️ Blueprint assumes WebSocket optional; code treats it as required for metadata**
   - Current: Agent sends metadata via WebSocket. If WS closes before metadata sent, HTTP API won't be detected.
   - Needed: Agent should send metadata via HTTP too, or make WS truly optional.

---

## 2. Repo-Specific Target Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│              Cloud Next.js App (Vercel/Railway)                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Routes (Stateless)                                  │   │
│  │  - /api/chat (tool execution)                            │   │
│  │  - /api/users/[userId]/agent-status                      │   │
│  │  - /api/agent/download                                   │   │
│  │  - /api/agent/permissions (proxy)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Client (lib/infrastructure/agent-client.ts)       │   │
│  │  - getConnectionStatus(userId) → ConnectionStatus         │   │
│  │  - executeOperation(userId, operation, args)              │   │
│  │  - HTTP-only (no WebSocket dependency)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  In-Memory Cache (global.agentMetadata)                  │   │
│  │  - userId → { httpPort, lastHealthCheck, status }         │   │
│  │  - Single-tenant: No database needed                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP (http://cloud/api/*)
┌─────────────────────────────────────────────────────────────────┐
│                    User's Browser                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Unified Status Component                                 │   │
│  │  - Shows ConnectionStatus enum                           │   │
│  │  - One-click install/connect                              │   │
│  │  - Auto-detects running agent                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP (http://127.0.0.1:4001/*)
┌─────────────────────────────────────────────────────────────────┐
│        Local Agent Daemon (User's Machine)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTTP API (port 4001, 127.0.0.1)                        │   │
│  │  - /health (fast, lightweight) ← NEW                     │   │
│  │  - /status (detailed)                                     │   │
│  │  - /execute, /fs/* (all tool operations)                  │   │
│  │  - /plan/approve, /kill, /logs                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Permission Engine                                        │   │
│  │  - Enforces Safe/Balanced/Unrestricted                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Audit Logger                                            │   │
│  │  - All operations logged                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↕                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Local File System & Command Execution                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- **HTTP-only is production:** `"http-only"` connection status is the success path. WebSocket is optional/future.
- **Pre-built binaries:** Agent is packaged as static executables (no Node/pnpm on user machine). **Non-negotiable requirement.**
- **OS-level services:** Installer registers agent as user service (auto-starts on boot). No manual terminal commands.
- **In-memory cache:** `global.agentMetadata` is acceptable for current single-tenant setup. When moving to multi-tenant/horizontal scaling, will be replaced by a real agent registry (database or cache).
- **Fast health checks:** `/health` endpoint for <200ms checks.

### 2.2 Connection Status Model (Repo-Specific)

```typescript
/**
 * Connection status enum for THIS repo
 * For v1 of the product, `"http-only"` **is the success path**.
 * `"full"` (HTTP + WebSocket) is optional and not required for any critical feature.
 * WebSocket is unstable and will be treated as optional/future real-time channel.
 */
type ConnectionStatus = 
  | "none"       // No agent detected
  | "http-only"  // HTTP API available (production success path)
  | "full";      // HTTP + WebSocket (optional, future real-time features only)

interface ConnectionInfo {
  status: ConnectionStatus;
  httpPort?: number;
  httpHealth: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck: number; // Timestamp
  metadata?: {
    homeDirectory: string;
    platform: string;
    hasPermissions: boolean;
    mode: 'safe' | 'balanced' | 'unrestricted' | null;
  };
}

/**
 * Feature availability
 */
const FEATURE_AVAILABILITY = {
  "none": {
    available: [],
    message: "Install agent to enable local environment features",
  },
  "http-only": {
    available: ["fs.list", "fs.read", "fs.write", "fs.delete", "fs.move", "exec.run", "permissions", "logs"],
    message: "Connected via HTTP (all features available)",
  },
  "full": {
    available: ["all"],
    message: "Connected via HTTP + WebSocket (all features available)",
  },
} as const;
```

**Health Check Logic:**
```typescript
/**
 * Check agent health via HTTP /health endpoint
 * Fast check (<200ms timeout)
 */
async function checkAgentHealth(userId: string): Promise<ConnectionInfo> {
  // 1. Get httpPort from cache (or default 4001)
  const metadata = global.agentMetadata?.get(userId);
  const httpPort = metadata?.httpPort || 4001;
  
  // 2. Check HTTP /health endpoint (fast)
  let httpHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  try {
    const response = await fetch(`http://127.0.0.1:${httpPort}/health`, {
      signal: AbortSignal.timeout(200), // Fast check
    });
    httpHealth = response.ok ? "healthy" : "unhealthy";
  } catch {
    httpHealth = "unhealthy";
  }
  
  // 3. Determine status (HTTP-only is primary success mode)
  const status: ConnectionStatus = 
    httpHealth === "healthy" ? "http-only" : "none";
  
  // 4. Update cache
  if (httpHealth === "healthy" && metadata) {
    global.agentMetadata.set(userId, {
      ...metadata,
      lastHealthCheck: Date.now(),
    });
  }
  
  return {
    status,
    httpPort: httpHealth === "healthy" ? httpPort : undefined,
    httpHealth,
    lastHealthCheck: Date.now(),
    metadata: httpHealth === "healthy" ? metadata : undefined,
  };
}
```

**UI Display:**
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
        text: "Connected", 
        color: "green",
        icon: "✅",
        action: null // Already connected
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

### 2.3 Install / Connect UX (Repo-Specific)

#### Target Flow: 1-2 Click Install

**Step 1: User clicks "Enable Local Environment" toggle**
- Toggle switches ON (`LocalEnvToggle`)
- System checks for running agent:
  - Tests `http://127.0.0.1:4001/health` (fast, 200ms timeout)
  - If healthy → Status: "http-only" → Show "Connected"
  - If unhealthy → Show install flow

**Step 2a: Agent Already Running (1 click)**
- UI detects agent via `/health` check
- Shows "Connected" status
- User can immediately use features (after approving permissions)

**Step 2b: Agent Not Running (2 clicks)**
- Click 1: "Install Agent" button (`AgentAutoInstaller`)
  - Calls `/api/agent/download` with an OS hint (from User-Agent)
  - Returns a platform-specific installer:
    - Windows: signed `.exe` or `.msi`
    - macOS: `.pkg` or `.dmg` with bundled app/LaunchAgent
    - Linux: `.AppImage`, `.deb`, `.rpm`, or a simple `.sh` that copies a pre-built binary
- Click 2: User runs installer (double-click or `chmod +x && ./installer` for Linux)
  - Installer performs **no builds**. It:
    1. Copies a **pre-built agent binary** into a stable location:
       - Linux: `~/.op15-agent/op15-agent`
       - macOS: `~/Library/Application Support/op15-agent/op15-agent`
       - Windows: `%LOCALAPPDATA%\op15-agent\op15-agent.exe`
    2. Writes `config.json` alongside the binary:
       ```json
       {
         "serverUrl": "<cloudUrl>",
         "userId": "<userId>",
         "sharedSecret": "<random-128-bit-token>",
         "httpPort": 4001
       }
       ```
    3. Registers the agent as a **user-level background service**:
       - Linux: `systemd --user` unit `op15-agent.service`
       - macOS: `~/Library/LaunchAgents/com.op15.agent.plist`
       - Windows: service or scheduled task under the current user
    4. Starts the service immediately
  - Once the service is up:
    - Agent binds **only** to `127.0.0.1:4001`
    - `/health` returns 200
    - Agent uses `serverUrl` + `userId` + `sharedSecret` to register with `/api/agent/register`
    - UI sees `status: "http-only"` and flips to "Connected"

**Step 3: Permission Approval (1 click)**
- After connection detected, `AgentPermissionsPanel` appears
- User clicks "Balanced" (or Safe/Unrestricted)
- Permissions set via HTTP API (`/api/agent/permissions` → `/plan/approve`)
- Features immediately available

**Total Clicks:**
- **Best case:** 2 clicks (Enable → Approve permissions)
- **Worst case:** 3 clicks (Enable → Install → Approve)

#### Error Handling

**Clear Error States:**
- "Agent not found" → Show "Install Agent" button
- "Agent not responding" → Show "Restart Agent" button (sends signal to agent or shows instructions)
- "Permission denied" → Show "Approve Permissions" button
- "Connection lost" → Auto-retry `/health` check, show reconnection status

**No Silent Failures:**
- Every error state has a clear action
- No "connected" status when agent is actually down
- Health checks are fast and cached (200ms timeout, 5s cache)

### 2.4 Permission Model (Repo-Specific)

**Same as blueprint:**
- Modes: `Safe`, `Balanced`, `Unrestricted`
- Enforcement in agent daemon (`local-agent/index.ts`)
- All operations logged
- Exposed via `/logs` endpoint

**No changes needed** - already implemented correctly.

---

### 2.5 Packaging & Security Model (Mass-User Ready)

#### Non-Goals (Hard Constraints)

**These are non-negotiable product requirements:**
- ❌ **No requirement for Node, pnpm, or any build tool on end-user machines**
- ❌ **No requirement to run terminal commands to start the agent**
- ❌ **No "temporary dev installers" that do builds on the client**
- ❌ **No manual service management** (user must not run `systemctl`, `launchctl`, or Windows Services manually)

**Any installer or UI that suggests otherwise is a bug.**

#### Packaging

**Agent Distribution:**
- Agent is a **pre-built, single binary** per OS (built in CI/CD, not on user machines)
- Built using `pkg` or equivalent bundler that creates static executables
- No Node.js runtime required on user machine
- No source code or build toolchain required

**Installer Behavior:**
- `/api/agent/download` serves OS-specific installer that only:
  1. Copies the pre-built binary to a stable location:
     - Linux: `~/.op15-agent/op15-agent`
     - macOS: `~/Library/Application Support/op15-agent/op15-agent`
     - Windows: `%LOCALAPPDATA%\op15-agent\op15-agent.exe`
  2. Writes `config.json` alongside the binary with:
     - `serverUrl`: Cloud server URL
     - `userId`: User's Clerk ID
     - `sharedSecret`: Random 128-bit token (generated per install)
     - `httpPort`: 4001 (default)
  3. Registers the binary as a user-level background service:
     - Linux: `systemd --user` unit `op15-agent.service`
     - macOS: `~/Library/LaunchAgents/com.op15.agent.plist`
     - Windows: Service or scheduled task under current user
  4. Starts the service immediately

**Result:** Click → Download → Run installer → Done (no terminal, no build tools)

#### Network Surface

**Agent Binding:**
- Agent binds **only** to `127.0.0.1` (never `0.0.0.0`)
- Primary API is HTTP on `127.0.0.1:<port>` (default 4001)
- WebSocket is optional and never required for core operations
- Agent never exposes ports to the network (localhost only)

**Communication:**
- Cloud → Agent: HTTP requests to `http://127.0.0.1:4001/*` (with mandatory `sharedSecret` header)
- Agent → Cloud: HTTP POST to `/api/agent/register` (initial registration)
- Browser → Agent: Proxied through cloud (`/api/agent/permissions`)
- Requests missing or failing secret validation must be rejected with generic `401 Unauthorized` and logged locally

#### Authentication & Security

**Shared Secret Model (Mandatory):**
- The shared-secret handshake between cloud and agent is **mandatory**, not optional, for all production builds
- **No HTTP request from the cloud to the agent may be accepted without a valid secret**
- Every cloud → agent request includes `sharedSecret` in:
  - `Authorization: Bearer <token>` header, OR
  - Custom header: `X-Agent-Secret: <token>`
- Agent rejects any request where:
  - Header is missing → `401 Unauthorized` (generic error, logged locally)
  - Secret doesn't match `config.json` → `401 Unauthorized` (generic error, logged locally)
- Secret is random per install (128-bit token)
- Cloud stores secret per `userId` in `global.agentMetadata` (or future database)

**Security Boundaries:**
- Agent enforces all permissions (cloud cannot bypass)
- All operations logged at agent level (cannot be bypassed)
- Agent runs as current user (no elevated privileges)
- No network exposure (localhost only)

**Why This Works for Mass Users:**
- No build toolchain required (pre-built binaries)
- No Node.js required (static executable)
- No terminal knowledge required (GUI installers)
- Secure by default (shared secret, localhost only)
- OS-level service (auto-starts on boot, survives reboots)

---

## 3. Phased Migration Plan

**Priority Note:** Phase 1 exists to remove all dev-style install friction. There must be NO terminal instructions or build steps on the user's machine after this phase.

### Phase 1: Installer + Binaries + 1–2 Click UX

**Goal:** Eliminate all dev toolchain requirements. Pre-built binaries + OS-native installers. Zero terminal commands.

**Tasks:**

#### Task 1.1: Build OS-specific agent binaries in CI/CD

**Files:**
- `local-agent/package.json`
- `local-agent/tsconfig.json`
- `.github/workflows/build-agent.yml` (or equivalent CI pipeline)
- `app/api/agent/download/route.ts`

**Changes:**

1. **Ensure `local-agent` has a single entry point (`local-agent/index.ts`) that:**
   - Reads `config.json` to get `serverUrl`, `userId`, `sharedSecret`, `httpPort`
   - Starts HTTP server on `127.0.0.1:httpPort`
   - Validates `sharedSecret` on all HTTP requests (mandatory security)
   - Optionally connects WebSocket (but **HTTP is primary**)

2. **Add a bundling step using `pkg` (or equivalent like `nexe`) to produce one static binary per OS:**
   - `agent-linux-x64`
   - `agent-macos-x64`
   - `agent-macos-arm64`
   - `agent-win-x64.exe`

3. **Wire a CI job that:**
   - Runs `pnpm build` inside `local-agent`
   - Runs `pkg` for each target OS/arch
   - Uploads the binaries as release artifacts that `/api/agent/download` can stream

4. **Update `/api/agent/download` to:**
   - Serve the pre-built binary (not source code)
   - Generate OS-native installer that:
     - Copies binary to stable location (`~/.op15-agent/op15-agent`, etc.)
     - Writes `config.json` with `serverUrl`, `userId`, `sharedSecret` (random 128-bit token)
     - Registers OS-level service (systemd user / LaunchAgent / Windows service)
     - Starts service immediately

**Result:**
- Users download **binaries**, not source
- Installers just drop the binary + config + service file
- No Node, no pnpm, no build on user machines
- Click → Download → Run installer → Done

**Risk:** Medium (requires CI/CD setup, packaging tooling)

**Expected:** True 1-click install (no build toolchain required)

---

#### Task 1.2: Remove legacy dev installer scripts

**Files:**
- `installer-src/installer.js` (DELETE or mark as deprecated)
- `installer-src/installer-server.js` (DELETE or mark as deprecated)
- `components/local-env/agent-connection-guide.tsx`

**Changes:**

1. **Delete or deprecate `installer-src/*` scripts** that run `pnpm build` on user machine
2. **Update `agent-connection-guide.tsx`** to:
   - Remove all terminal command displays
   - Show "Install Agent" button instead
   - Link to OS-specific installer documentation if needed

**Risk:** Low (removing broken code)

**Expected:** No references to Node/pnpm/CLI in UI

---

#### Task 1.3: Auto-detect running agent on page load

**Files:**
- `components/local-env/agent-auto-installer.tsx`

**Changes:**

**On mount, check `/health` directly:**
```typescript
useEffect(() => {
  // On mount, check if agent is already running
  const checkRunningAgent = async () => {
    try {
      // Try default port 4001
      const response = await fetch('http://127.0.0.1:4001/health', {
        signal: AbortSignal.timeout(200),
      });
      
      if (response.ok) {
        // Agent is running - check if registered
        const statusResponse = await fetch(`/api/users/${user.id}/agent-status`);
        const status = await statusResponse.json();
        
        if (status.status !== "none") {
          setIsConnected(true);
          setConnectionStatus(status.status);
        } else {
          // Agent running but not registered - register it
          await registerAgent();
        }
      }
    } catch {
      // Agent not running - show install button
    }
  };
  
  checkRunningAgent();
}, [user]);
```

**Risk:** Low (additive)

**Expected:** Faster connection detection (no polling needed)

---

**Success Criteria:**
- ✅ Pre-built binaries available for all platforms
- ✅ Installer copies binary + config + service (no builds)
- ✅ No manual terminal commands required
- ✅ No Node/pnpm required on user machine
- ✅ Legacy dev installer scripts removed
- ✅ UI shows no CLI commands

---

### Phase 2: Health Checks + ConnectionStatus + HTTP-Only

**Goal:** Implement real health checks and `ConnectionStatus` enum. Make HTTP the primary (and sufficient) protocol.

**Tasks:**

#### Task 2.1: Add `/health` endpoint to agent

**Files:**
- `local-agent/index.ts`

**Changes:**
```typescript
// In startHttpServer(), add new route:
if (url.pathname === '/health' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  return;
}
```

**Risk:** Low (new endpoint, doesn't break existing)

**Expected:** Fast health checks (<200ms)

---

#### Task 1.2: Implement `ConnectionStatus` enum and `getConnectionStatus()`

**Files:**
- `lib/infrastructure/connection-status.ts` (NEW)
- `lib/infrastructure/bridge-manager.ts`
- `app/api/users/[userId]/agent-status/route.ts`

**Changes:**

**New file: `lib/infrastructure/connection-status.ts`**
```typescript
export type ConnectionStatus = "none" | "http-only" | "full";

export interface ConnectionInfo {
  status: ConnectionStatus;
  httpPort?: number;
  httpHealth: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck: number;
  metadata?: {
    homeDirectory: string;
    platform: string;
    hasPermissions: boolean;
    mode: 'safe' | 'balanced' | 'unrestricted' | null;
  };
}

export async function getConnectionStatus(userId: string): Promise<ConnectionInfo> {
  // 1. Get httpPort from cache (or default 4001)
  const metadata = (global as any).agentMetadata?.get(userId);
  const httpPort = metadata?.httpPort || 4001;
  
  // 2. Check HTTP /health endpoint (fast)
  let httpHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  try {
    const response = await fetch(`http://127.0.0.1:${httpPort}/health`, {
      signal: AbortSignal.timeout(200), // Fast check
    });
    httpHealth = response.ok ? "healthy" : "unhealthy";
  } catch {
    httpHealth = "unhealthy";
  }
  
  // 3. Determine status
  const status: ConnectionStatus = httpHealth === "healthy" ? "http-only" : "none";
  
  return {
    status,
    httpPort: httpHealth === "healthy" ? httpPort : undefined,
    httpHealth,
    lastHealthCheck: Date.now(),
    metadata: httpHealth === "healthy" ? metadata : undefined,
  };
}
```

**Update `bridge-manager.ts`:**
```typescript
// Replace isConnected() with:
import { getConnectionStatus } from './connection-status';

async isConnected(userId: string): Promise<boolean> {
  const info = await getConnectionStatus(userId);
  return info.status !== "none";
}
```

**Update `agent-status/route.ts`:**
```typescript
// Replace boolean flags with:
import { getConnectionStatus } from '@/lib/infrastructure/connection-status';

const connectionInfo = await getConnectionStatus(userId);
return NextResponse.json({
  status: connectionInfo.status,
  httpPort: connectionInfo.httpPort,
  httpHealth: connectionInfo.httpHealth,
  metadata: connectionInfo.metadata,
});
```

**Risk:** Medium (changes core logic)

**Expected:** Accurate connection status, consistent across codebase

---

#### Task 2.3: Update UI to use `ConnectionStatus` enum

**Files:**
- `components/local-env/agent-auto-installer.tsx`
- `components/local-env/agent-permissions-panel.tsx`
- `components/local-env/agent-connection-guide.tsx`

**Changes:**

**Update `agent-auto-installer.tsx`:**
```typescript
// Replace boolean flags with:
const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("none");

// In checkAgentStatus():
const response = await fetch(`/api/users/${user.id}/agent-status`);
const data = await response.json();
setConnectionStatus(data.status); // "none" | "http-only" | "full"

// In render:
{connectionStatus === "none" && <InstallButton />}
{connectionStatus === "http-only" && <ConnectedStatus />}
```

**Update `agent-permissions-panel.tsx`:**
```typescript
// Only show if status !== "none"
if (connectionStatus === "none") {
  return null;
}
```

**Update `agent-connection-guide.tsx`:**
```typescript
// Only show if status === "none"
// MUST NOT show terminal commands - only "Install Agent" button
if (connectionStatus !== "none") {
  return null;
}
```

**Risk:** Low (UI only)

**Expected:** Clear status display, consistent with backend. No CLI commands shown.

---

#### Task 2.4: Ensure tools go through HTTP-first path

**Files:**
- `lib/tools/fs.ts`
- `lib/tools/exec.ts`

**Changes:**

**Option A (Recommended): Remove early connection checks**
```typescript
// In handleFsList(), handleExecRun(), etc.:
// REMOVE this check:
// if (!bridgeManager.isConnected(context.userId)) {
//   throw new Error("Agent not connected");
// }

// Just call requestBrowserOperation() directly:
// It will try HTTP first, then throw error if HTTP fails
const result = await bridgeManager.requestBrowserOperation(...);
```

**Option B (Alternative): Use async isConnected()**
```typescript
// If keeping checks, make them async:
const isConnected = await bridgeManager.isConnected(context.userId);
if (!isConnected) {
  throw new Error("Agent not connected");
}
```

**Risk:** Low (simplifies code)

**Expected:** Tools always try HTTP API, no false negatives

---

**Success Criteria:**
- ✅ `/health` endpoint exists and responds <200ms
- ✅ `ConnectionStatus` enum used everywhere
- ✅ Real HTTP health checks (not just metadata)
- ✅ UI shows clear status ("none", "http-only", "full")
- ✅ Tools work with HTTP-only (no WebSocket dependency)
- ✅ `"http-only"` treated as production success path

---

### Phase 3: Optional WebSocket / Real-Time (Future)

**Goal:** Only if/when real-time features are needed. Make WebSocket truly optional. Remove hard dependencies on WebSocket for core flows.

**Note:** This phase is optional and can be deferred. HTTP-only is sufficient for all critical features.

**Tasks:**

#### Task 3.1: Make agent send metadata via HTTP (not just WebSocket)

**Files:**
- `local-agent/index.ts`

**Changes:**

**Add HTTP registration endpoint:**
```typescript
// In startHttpServer(), add:
if (url.pathname === '/register' && req.method === 'POST') {
  this.handleRegister(req, res);
  return;
}

// Add handler:
private handleRegister(req: http.IncomingMessage, res: http.ServerResponse): void {
  const metadata = {
    userId: this.userId,
    homeDirectory: process.env.HOME || process.env.USERPROFILE || '/home/user',
    platform: process.platform,
    httpPort: parseInt(process.env.AGENT_HTTP_PORT || '4001', 10),
  };
  
  // Send to cloud server
  fetch(`${this.serverUrl}/api/agent/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  }).catch(err => console.error('Failed to register:', err));
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}
```

**Update agent startup:**
```typescript
// In constructor or connect(), after HTTP server starts:
// Register via HTTP (don't wait for WebSocket)
this.registerViaHttp();
```

**Risk:** Low (additive change)

**Expected:** Agent metadata available even if WebSocket fails

---

#### Task 3.2: Add `/api/agent/register` endpoint in cloud

**Files:**
- `app/api/agent/register/route.ts` (NEW)

**Changes:**
```typescript
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = await req.json();
  
  // Store in global.agentMetadata (same as WebSocket path)
  if (!global.agentMetadata) {
    global.agentMetadata = new Map();
  }
  
  global.agentMetadata.set(userId, {
    homeDirectory: body.homeDirectory,
    platform: body.platform,
    httpPort: body.httpPort || 4001,
  });
  
  return NextResponse.json({ success: true });
}
```

**Risk:** Low (new endpoint)

**Expected:** Agent can register via HTTP, no WebSocket dependency

---

#### Task 3.3: Remove hard WebSocket dependencies from tool execution

**Files:**
- `lib/infrastructure/bridge-manager.ts`

**Changes:**

**Update `requestBrowserOperation()`:**
```typescript
async requestBrowserOperation(userId, operation, args) {
  // Try HTTP API first (primary)
  const httpPort = this.getAgentHttpPort(userId);
  if (httpPort) {
    try {
      const { AgentHttpClient } = await import('./agent-http-client');
      const client = new AgentHttpClient(httpPort);
      return await client.executeOperation(operation as any, args);
    } catch (error) {
      // HTTP failed - throw error (don't fall back to WebSocket)
      throw new Error(`Agent HTTP API failed: ${error.message}`);
    }
  }
  
  // No HTTP port - agent not registered
  throw new Error(`Agent not registered for user ${userId}`);
}
```

**Remove WebSocket fallback** (or make it explicit opt-in for future real-time features)

**Risk:** Medium (removes fallback, but HTTP should be reliable)

**Expected:** Tools use HTTP only, no WebSocket dependency

---

#### Task 3.4: Make WebSocket optional in agent startup

**Files:**
- `local-agent/index.ts`

**Changes:**

**Make WebSocket connection optional:**
```typescript
// In constructor:
constructor(serverUrl: string, userId: string, authToken?: string) {
  this.serverUrl = serverUrl;
  this.userId = userId;
  this.authToken = authToken;
  this.startHttpServer();
  
  // WebSocket is optional - try to connect, but don't fail if it fails
  this.connectWebSocket().catch(err => {
    console.warn('WebSocket connection failed (optional):', err);
    console.log('Agent will work via HTTP API only');
  });
}
```

**Risk:** Low (makes WS optional)

**Expected:** Agent works even if WebSocket fails

---

**Success Criteria:**
- ✅ Agent registers via HTTP (not just WebSocket)
- ✅ Tools use HTTP only (no WebSocket fallback)
- ✅ Agent works even if WebSocket fails
- ✅ WebSocket is truly optional (not required for any feature)

---

**Note:** Phase 3 is optional and can be deferred. All critical features work with HTTP-only.

**Note:** Additional UX improvements (restart button, structured error messages) can be added incrementally. The critical requirement is that Phase 1 removes all dev toolchain dependencies.

---

## Summary

### Current State

**What Works:**
- ✅ Agent HTTP API (port 4001)
- ✅ HTTP-first operation routing
- ✅ Permission enforcement
- ✅ UI components

**What's Broken:**
- ❌ No `/health` endpoint (only `/status`)
- ❌ No `ConnectionStatus` enum (boolean flags)
- ❌ No real HTTP health checks (metadata only)
- ❌ Manual install flow (requires Node/pnpm, `cd local-agent && pnpm build && node dist/index.js`)
- ❌ No pre-built binaries (users must build from source)
- ❌ WebSocket required for metadata (unstable)

### Target State

**Architecture:**
- HTTP-only for operations (WebSocket optional)
- `/health` endpoint for fast checks
- `ConnectionStatus` enum ("none", "http-only", "full")
- In-memory cache (single-tenant, no database)

**UX:**
- 1-2 click install (pre-built binaries, no build tools)
- Auto-detect running agent
- Clear error messages
- Fast health checks (<200ms)

### Migration Timeline

**Phase 1 (Week 1):** Installer + Binaries + 1–2 Click UX (CRITICAL)
- Build OS-specific binaries in CI/CD
- Installer copies binary + config + service (no builds)
- Remove legacy dev installer scripts
- Auto-detect agent on page load
- **Result: Zero terminal commands, zero build tools on user machine**

**Phase 2 (Week 2):** Health Checks + ConnectionStatus + HTTP-Only
- Add `/health` endpoint
- Implement `ConnectionStatus` enum
- Real HTTP health checks
- Update UI to use enum
- Make tools HTTP-only

**Phase 3 (Week 3+):** Optional WebSocket / Real-Time (Future)
- Agent registers via HTTP
- Make WebSocket truly optional
- Only if real-time features are needed

**Total Timeline:** 3 weeks

---

**Next Steps:**
1. Review this document
2. Approve migration plan
3. Start Phase 1 implementation
4. Test incrementally
5. Deploy phase by phase

