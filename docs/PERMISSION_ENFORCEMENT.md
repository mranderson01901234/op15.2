# Permission Enforcement Implementation

## Overview

The local agent now includes **hard permission enforcement** at the daemon level. All operations are checked against session permissions before execution, ensuring the LLM cannot bypass safety checks.

## Features Implemented

### ✅ 1. Session Permissions System

The agent maintains session permissions that control what operations are allowed:

```typescript
interface SessionPermissions {
  allowedDirectories: string[];  // Whitelist of directories
  allowedOperations: ('read' | 'write' | 'delete' | 'exec')[];
  approvedPlan?: Array<{ id: string; operation: string; args: Record<string, unknown> }>;
  mode: 'safe' | 'balanced' | 'unrestricted';
}
```

### ✅ 2. Permission Modes

**Safe Mode:**
- Only read operations (`fs.list`, `fs.read`) allowed
- No writes, deletes, or command execution
- Default when no permissions set

**Balanced Mode:**
- Operations allowed based on `allowedOperations` array
- Paths must be within `allowedDirectories` whitelist
- Most restrictive mode with safety

**Unrestricted Mode:**
- All operations allowed
- Still fully logged
- Use with caution

### ✅ 3. Permission Checking

Every request is checked **before execution**:

```typescript
// In handleRequest()
const permissionCheck = this.checkPermission(request);
if (!permissionCheck.allowed) {
  // Deny and log
  this.sendResponse(request.id, undefined, `Permission denied: ${permissionCheck.reason}`);
  return;
}
```

### ✅ 4. HTTP API Endpoints

The agent now exposes HTTP endpoints on `http://127.0.0.1:4001` (configurable via `AGENT_HTTP_PORT`):

**POST `/plan/approve`**
- Approve a plan and set session permissions
- Body: `{ allowedDirectories: string[], allowedOperations: string[], mode: string, approvedPlan?: array }`
- Returns: `{ success: true }`

**POST `/kill`**
- Emergency kill switch - immediately stops agent
- Returns: `{ success: true }`
- Agent exits after 1 second

**GET `/status`**
- Get current agent status and permissions
- Returns: `{ connected, userId, hasPermissions, mode, allowedDirectories, allowedOperations, isShuttingDown }`

**GET `/logs?limit=100`**
- Get action logs
- Returns: `{ logs: ActionLog[], total: number }`

### ✅ 5. WebSocket Plan Approval

Plan can also be approved via WebSocket:

```json
{
  "type": "plan-approve",
  "allowedDirectories": ["/home/user/projects"],
  "allowedOperations": ["read", "write", "exec"],
  "mode": "balanced",
  "approvedPlan": [...]
}
```

Agent responds with:
```json
{
  "type": "plan-approved",
  "success": true
}
```

### ✅ 6. Action Logging

Every action is logged with:
- Timestamp
- User ID
- Operation type
- Path/command
- Result (success/error/denied)
- Details (exit codes, file sizes, etc.)

Logs are kept in memory (last 1000 entries) and accessible via `/logs` endpoint.

## Usage Flow

### 1. Start Agent

```bash
cd local-agent
pnpm build
node dist/index.js http://localhost:3000 user_123
```

Agent will:
- Connect via WebSocket
- Start HTTP server on port 4001
- Begin in "safe" mode (read-only)

### 2. Approve Plan (via HTTP)

```bash
curl -X POST http://127.0.0.1:4001/plan/approve \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "balanced",
    "allowedDirectories": ["/home/user/projects", "/home/user/Desktop"],
    "allowedOperations": ["read", "write", "exec"],
    "approvedPlan": [
      {"id": "step1", "operation": "exec.run", "args": {"command": "git clone ..."}},
      {"id": "step2", "operation": "exec.run", "args": {"command": "pnpm install"}}
    ]
  }'
```

### 3. Check Status

```bash
curl http://127.0.0.1:4001/status
```

### 4. View Logs

```bash
curl http://127.0.0.1:4001/logs?limit=50
```

### 5. Emergency Kill Switch

```bash
curl -X POST http://127.0.0.1:4001/kill
```

## Integration with UI

The UI should:

1. **Show Plan Preview**
   - When LLM generates a plan, show it to user
   - Display operations, paths, commands
   - Ask for approval

2. **Approve Plan**
   - Extract allowed directories from plan
   - Determine allowed operations
   - Call `/plan/approve` endpoint
   - Or send `plan-approve` via WebSocket

3. **Show Kill Switch**
   - Add prominent "Stop Agent" button
   - Calls `/kill` endpoint
   - Shows confirmation

4. **Display Logs**
   - Show recent actions in UI
   - Allow user to review what agent did
   - Export logs if needed

## Example: Approving a Git Clone Plan

```typescript
// In UI
const plan = [
  { id: "step1", operation: "exec.run", args: { command: "git clone https://github.com/user/repo.git", cwd: "/home/user/projects" }},
  { id: "step2", operation: "exec.run", args: { command: "cd repo && pnpm install", cwd: "/home/user/projects/repo" }},
];

// Extract allowed directories
const allowedDirs = ["/home/user/projects"];

// Approve plan
await fetch('http://127.0.0.1:4001/plan/approve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'balanced',
    allowedDirectories: allowedDirs,
    allowedOperations: ['read', 'exec'],
    approvedPlan: plan,
  }),
});
```

## Security Notes

1. **HTTP Server Binding**: HTTP server binds to `127.0.0.1` only (localhost), not `0.0.0.0` (all interfaces). This prevents remote access.

2. **No Authentication**: HTTP endpoints have no authentication. This is acceptable because:
   - Server only listens on localhost
   - Only user's own machine can access
   - User controls the agent process

3. **Permission Enforcement**: All operations are checked **in the daemon**, not in the cloud server. Even if LLM tries to bypass, daemon will deny.

4. **Logging**: All actions are logged, including denied requests. This provides audit trail.

## Next Steps

1. **UI Integration**: Create plan preview component
2. **Mode Selection**: Add UI for selecting mode (Safe/Balanced/Unrestricted)
3. **Directory Selection**: UI for selecting allowed directories
4. **Log Viewer**: UI component to view action logs
5. **Kill Switch UI**: Prominent button in UI

## Testing

Test permission enforcement:

```bash
# 1. Start agent
node dist/index.js http://localhost:3000 test_user

# 2. Try operation without approval (should fail)
# Send exec.run request → should get "Permission denied"

# 3. Approve plan
curl -X POST http://127.0.0.1:4001/plan/approve -d '{"mode":"balanced","allowedDirectories":["/tmp"],"allowedOperations":["exec"]}'

# 4. Try operation again (should succeed)
# Send exec.run request → should execute

# 5. Check logs
curl http://127.0.0.1:4001/logs
```

