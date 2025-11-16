# Agent Connection Testing Guide

This guide explains how to test if the local agent is connected correctly.

## Quick Test Methods

### 1. **Visual UI Indicators**

#### Sidebar Footer (Bottom of Sidebar)
- ✅ **Green dot** + "Agent Connected" = Agent is connected
- ⚠️ **Yellow dot** + "Agent Not Connected" = Agent is not connected

#### Sidebar Agent Installer Section
- ✅ **"Agent connected"** (green) = Connected
- ⚠️ **"Agent installed but not connected"** (yellow) = Installed but not running
- ❌ **"Install Local Agent"** button = Not installed

### 2. **Browser Console Test**

Open your browser's developer console (F12) and run:

```javascript
// Get your user ID from Clerk
const userId = await window.Clerk?.user?.id || 'YOUR_USER_ID_HERE';

// Test 1: Check agent status API (checks WebSocket + metadata - most accurate)
const statusResponse = await fetch(`/api/users/${userId}/agent-status`, {
  cache: 'no-store'
});
const status = await statusResponse.json();
console.log('Agent Status:', {
  connected: status.connected, // ✅ True only if BOTH WebSocket AND metadata exist
  websocketConnected: status.websocketConnected,
  hasMetadata: status.hasMetadata,
  userHomeDirectory: status.userHomeDirectory,
  diagnostics: status.diagnostics
});

// Test 2: Check workspace API (for comparison)
const workspaceResponse = await fetch(`/api/users/${userId}/workspace`, {
  cache: 'no-store'
});
const config = await workspaceResponse.json();
console.log('Workspace Config:', {
  userHomeDirectory: config.userHomeDirectory,
  workspaceRoot: config.workspaceRoot,
  restrictionLevel: config.restrictionLevel
});
```

### 3. **API Endpoint Test (cURL)**

```bash
# Replace YOUR_USER_ID with your actual Clerk user ID

# Test agent status (most accurate - checks WebSocket + metadata)
curl http://localhost:3000/api/users/YOUR_USER_ID/agent-status | jq

# Expected response if connected:
# {
#   "connected": true,              # ← True only if BOTH conditions met
#   "websocketConnected": true,     # ← WebSocket is active
#   "hasMetadata": true,            # ← Metadata exists
#   "userHomeDirectory": "/home/username",
#   "diagnostics": {
#     "websocketState": "connected",
#     "metadataState": "present"
#   }
# }

# Expected response if NOT connected:
# {
#   "connected": false,             # ← False if either condition fails
#   "websocketConnected": false,   # ← WebSocket disconnected OR
#   "hasMetadata": false,          # ← Metadata missing
#   "userHomeDirectory": null,
#   "diagnostics": {
#     "websocketState": "disconnected",
#     "metadataState": "missing"
#   }
# }

# For comparison, check workspace API:
curl http://localhost:3000/api/users/YOUR_USER_ID/workspace | jq
```

### 4. **Server Logs Check**

Check your terminal where `pnpm dev` is running. Look for:

#### ✅ **Connected Successfully:**
```
✅ Local agent connected successfully { userId: 'user_xxx' }
📁 Cached filesystem index for user user_xxx: 1234 paths
```

#### ❌ **Not Connected:**
- No "✅ Local agent connected" message
- Or you see: `Agent disconnected { userId: 'user_xxx' }`

### 5. **Test Agent Functionality**

Once connected, test actual functionality:

```javascript
// Test file listing (requires agent connection)
const testResponse = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'List files in my home directory'
    }]
  })
});
```

## How Connection Status Works

### Connection Flow:
1. **Agent starts** → Connects to WebSocket server (`/api/bridge`)
2. **Server receives connection** → Stores in `agents` Map and `global.agentMetadata`
3. **Agent sends metadata** → Includes `homeDirectory`, `platform`, `filesystemIndex`
4. **UI checks status** → Calls `/api/users/[userId]/workspace` → Checks for `userHomeDirectory`
5. **If `userHomeDirectory` exists** → Agent is connected ✅

### Status Check Logic:
- **`/api/users/[userId]/agent-status`** endpoint checks BOTH:
  1. **WebSocket connection**: `bridgeManager.isConnected(userId)` - checks active WebSocket
  2. **Metadata presence**: `global.agentMetadata.get(userId)?.homeDirectory` - checks stored metadata
- Agent is **truly connected** only if **BOTH** conditions are met ✅
- **`/api/users/[userId]/workspace`** only checks metadata (legacy method, less accurate)

## Troubleshooting

### Agent shows "Not Connected" but agent is running:

1. **Check agent logs** - Look for connection errors
2. **Verify WebSocket URL** - Agent should connect to `wss://your-domain.com/api/bridge`
3. **Check user ID match** - Agent must use the same user ID as your browser session
4. **Restart agent** - Stop and restart the agent process

### Agent connects but UI doesn't update:

1. **Refresh browser** - UI checks status on mount
2. **Click "Check" button** - In sidebar agent installer section
3. **Check browser console** - Look for API errors
4. **Verify authentication** - Make sure you're logged in

### Testing Connection Programmatically:

```typescript
// In your code, you can check connection status:
import { getBridgeManager } from '@/lib/infrastructure/bridge-manager';

const bridgeManager = getBridgeManager();
const isConnected = bridgeManager.isConnected(userId);
console.log('Bridge connected:', isConnected);
```

## Expected Behavior

### ✅ **Connected State:**
- Sidebar footer shows green dot + "Agent Connected"
- Agent installer shows "Agent connected" (green)
- Workspace API returns `userHomeDirectory`
- File operations work through agent
- Commands execute via agent

### ❌ **Not Connected State:**
- Sidebar footer shows yellow dot + "Agent Not Connected"
- Agent installer shows "Install Local Agent" or "Agent installed but not connected"
- Workspace API returns `userHomeDirectory: undefined`
- File operations may fall back to browser bridge (if enabled)
- Commands may sync workspace to cloud for execution

