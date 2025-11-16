# Architecture Plan Review

## Executive Summary

**Verdict: ✅ Excellent plan, aligns well with current architecture**

The proposed architecture is sound and addresses critical gaps in the current implementation. Your current setup already has most of the foundational pieces (separate agent daemon, WebSocket bridge), but lacks the safety/permission layer that makes "full access" actually safe.

## Current State Analysis

### ✅ What You Already Have

1. **Separate Agent Daemon** (`local-agent/index.ts`)
   - ✅ Already separate from Next.js
   - ✅ WebSocket connection to cloud server
   - ✅ Executes commands locally (`exec.run`)
   - ✅ File operations (`fs.list`, `fs.read`, `fs.write`, `fs.delete`, `fs.move`)
   - ✅ Runs as independent Node.js process

2. **WebSocket Bridge**
   - ✅ Stable connection (proven by standalone test)
   - ✅ Request/response pattern implemented
   - ✅ Connection management in `server.js`

3. **Tool Surface**
   - ✅ Already implements the proposed tools (`exec.run`, `fs.*`)
   - ✅ Clean separation between cloud LLM and local execution

### ❌ Critical Gaps

1. **No Permission Model**
   - Current: LLM prompt asks for confirmation (soft, can be bypassed)
   - Needed: Hard enforcement in daemon
   - Risk: LLM could execute destructive commands without real user approval

2. **No Session-Based Permissions**
   - Current: No concept of "approved plan" or session scope
   - Needed: Plan preview → user approval → session permissions
   - Risk: Every command requires individual confirmation (annoying) or none (dangerous)

3. **No Capability Modes**
   - Current: Binary on/off (connected or not)
   - Needed: Safe/Balanced/Unrestricted modes with different permission levels
   - Risk: Users can't choose their comfort level

4. **Insufficient Logging**
   - Current: Basic console.log in agent, logger utility exists but not comprehensive
   - Needed: Structured logging of every action (command, file op, timestamp, user, result)
   - Risk: Can't audit what agent did, can't debug issues

5. **No HTTP API in Daemon**
   - Current: Only WebSocket
   - Needed: HTTP endpoints for `/execute`, `/fs/*`, `/meta` (as proposed)
   - Benefit: Easier debugging, direct testing, optional browser access

6. **No Kill Switch**
   - Current: User can disconnect, but no explicit "emergency stop"
   - Needed: One-click daemon shutdown
   - Risk: Can't quickly stop runaway agent

## Plan Alignment Assessment

### ✅ Architecture Match: 95%

Your current architecture already follows the proposed pattern:

```
Current:
Cloud LLM → Next.js Server → WebSocket → Local Agent → OS

Proposed:
Cloud LLM → Next.js Server → WebSocket/HTTP → Local Daemon → OS
```

**Key Difference:** You need to add HTTP API and permission enforcement layer.

### ✅ Tool Surface Match: 100%

Your tools already match the proposed surface:
- ✅ `exec.run` (with `cmd`, `cwd`, `env`)
- ✅ `fs.list`, `fs.read`, `fs.write`, `fs.move`, `fs.delete`
- ✅ Clean, composable API

### ❌ Permission Model: 0% (Critical Gap)

**Current:** Confirmation handled in LLM prompt (soft)
**Needed:** Hard enforcement in daemon

**Impact:** This is the biggest gap. Without daemon-level enforcement, the LLM could potentially bypass confirmations.

### ⚠️ Logging: 30%

**Current:** Basic logging exists (`lib/utils/logger.ts`)
**Needed:** Comprehensive audit log of every action

**Gap:** Need structured logging with:
- Every command: timestamp, user, directory, exit code, stdout/stderr
- Every file op: path, operation type, before/after state
- Session tracking
- Exportable logs for user review

## Recommendations

### Priority 1: Critical Safety (Do First)

1. **Add Permission Enforcement in Daemon**
   ```typescript
   // In local-agent/index.ts
   interface SessionPermissions {
     allowedDirectories: string[];
     allowedOperations: ('read' | 'write' | 'delete' | 'exec')[];
     approvedPlan?: string[];
   }
   
   private sessionPermissions: SessionPermissions | null = null;
   
   private async handleRequest(request: BridgeRequest): Promise<void> {
     // Check permissions BEFORE executing
     if (!this.checkPermission(request)) {
       this.sendResponse(request.id, undefined, 'Permission denied');
       return;
     }
     // ... execute
   }
   ```

2. **Add Plan Preview & Approval Flow**
   - LLM generates plan (array of tool calls)
   - UI shows plan to user
   - User approves → daemon sets `sessionPermissions`
   - Daemon only executes approved operations

3. **Add Kill Switch**
   ```typescript
   // HTTP endpoint in daemon
   POST /kill → immediately stop all operations and disconnect
   ```

### Priority 2: User Experience

4. **Add Capability Modes**
   - Safe: Read-only, explicit confirmation for writes/exec
   - Balanced: Whitelisted directories, plan approval for destructive ops
   - Unrestricted: Full access, still logged

5. **Add HTTP API to Daemon**
   ```typescript
   // Add Express or native HTTP server
   POST /execute → exec.run
   GET /fs/list → fs.list
   GET /fs/read → fs.read
   POST /fs/write → fs.write
   GET /meta → env info, permissions, status
   POST /plan/approve → set session permissions
   POST /kill → emergency stop
   ```

### Priority 3: Observability

6. **Comprehensive Logging**
   ```typescript
   interface ActionLog {
     timestamp: number;
     userId: string;
     operation: string;
     path?: string;
     command?: string;
     result: 'success' | 'error';
     details: Record<string, unknown>;
   }
   
   // Log every action to file + expose via API
   GET /logs → retrieve action history
   ```

## Implementation Strategy

### Phase 1: Safety Foundation (Week 1)
1. Add permission checking in `handleRequest()`
2. Add plan approval flow (UI → daemon)
3. Add kill switch endpoint
4. Test with destructive commands (verify they're blocked without approval)

### Phase 2: User Experience (Week 2)
1. Add capability modes (Safe/Balanced/Unrestricted)
2. Add HTTP API to daemon
3. Update UI to show mode selection
4. Update UI to show plan preview/approval

### Phase 3: Observability (Week 3)
1. Add structured logging
2. Add log export/viewing UI
3. Add session tracking
4. Test audit trail completeness

## Potential Issues & Solutions

### Issue 1: Plan Approval Complexity
**Problem:** How to match LLM's tool calls to approved plan?

**Solution:** 
- LLM generates plan with IDs: `[{id: "step1", tool: "exec.run", args: {...}}, ...]`
- User approves plan with IDs
- Daemon stores approved IDs
- When tool call arrives, check if it matches approved plan

### Issue 2: Session Scope
**Problem:** When does a session end? How to handle multi-step operations?

**Solution:**
- Session = one conversation thread
- Session ends when user starts new conversation OR explicitly ends session
- Plan approval applies to entire session
- Can approve "all operations in this conversation"

### Issue 3: Directory Whitelisting
**Problem:** How to determine "whitelisted directories" for Balanced mode?

**Solution:**
- On first connection, scan home directory
- Suggest common directories (Projects, Code, Desktop, Documents)
- User selects which directories to whitelist
- Store in daemon config

### Issue 4: Daemon Distribution
**Problem:** Plan mentions "single binary" - you currently distribute source code

**Solution:**
- Keep current approach (source code) OR
- Use `pkg` or similar to create single binary
- For now, source code is fine - users run `node local-agent/dist/index.js`
- Can add binary distribution later

## Code Changes Required

### 1. Update `local-agent/index.ts`

Add permission checking:
```typescript
class LocalAgent {
  private sessionPermissions: SessionPermissions | null = null;
  
  private checkPermission(request: BridgeRequest): boolean {
    if (!this.sessionPermissions) {
      return false; // No session approved
    }
    
    // Check operation type
    if (request.operation === 'exec.run') {
      return this.sessionPermissions.allowedOperations.includes('exec');
    }
    
    // Check directory whitelist
    if (request.path) {
      const allowed = this.sessionPermissions.allowedDirectories.some(
        dir => request.path!.startsWith(dir)
      );
      if (!allowed) return false;
    }
    
    return true;
  }
  
  // Add method to set permissions from approved plan
  setSessionPermissions(permissions: SessionPermissions): void {
    this.sessionPermissions = permissions;
  }
}
```

### 2. Add HTTP Server to Daemon

```typescript
import http from 'http';
import { URL } from 'url';

// Add HTTP server alongside WebSocket
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  
  if (url.pathname === '/execute' && req.method === 'POST') {
    // Handle exec.run via HTTP
  }
  // ... other endpoints
});

httpServer.listen(4001, () => {
  console.log('HTTP API listening on http://localhost:4001');
});
```

### 3. Update UI for Plan Approval

Add component to show plan and get approval:
```typescript
// components/local-env/plan-approval.tsx
export function PlanApproval({ plan, onApprove, onReject }) {
  // Show plan steps
  // User clicks "Approve" → call daemon to set permissions
}
```

## Conclusion

**The plan is excellent and aligns perfectly with your current architecture.**

**Key Actions:**
1. ✅ You already have the daemon (great!)
2. ❌ Add permission enforcement (critical)
3. ❌ Add plan approval flow (critical)
4. ⚠️ Add HTTP API (nice to have)
5. ⚠️ Add comprehensive logging (important)

**Timeline:** 2-3 weeks to implement fully, but you can get basic safety (permissions + kill switch) in 2-3 days.

**Risk Level:** Without permission enforcement, you're shipping RCE without safety rails. With the plan's additions, you have a safe, auditable system.

