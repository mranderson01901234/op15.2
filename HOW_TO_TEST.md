# How to Test in the UI (localhost:3000)

## Current State

**What Works:**
- ✅ Agent HTTP API (port 4001)
- ✅ Permission enforcement
- ✅ HTTP client integration
- ✅ UI shows agent connection status

**What's Missing:**
- ❌ UI to approve permissions/plans
- ❌ Operations will fail because no permissions are set

## Step-by-Step Testing Guide

### Step 1: Start the Server

```bash
# Terminal 1: Start Next.js server
cd /home/dp/Desktop/op15
pnpm dev
# Server runs on http://localhost:3000
```

### Step 2: Start the Agent

```bash
# Terminal 2: Start the agent
cd /home/dp/Desktop/op15/local-agent
pnpm build
node dist/index.js http://localhost:3000 YOUR_USER_ID
# Replace YOUR_USER_ID with your actual Clerk user ID
```

**How to find your user ID:**
1. Open http://localhost:3000 in browser
2. Open browser console (F12)
3. Type: `localStorage.getItem('localEnvUserId')` or check the UI

### Step 3: Check Connection Status

1. Open http://localhost:3000
2. Look at the sidebar - you should see "Agent Connected" status
3. If not connected, check:
   - Agent is running in terminal
   - User ID matches
   - No errors in agent terminal

### Step 4: Approve Permissions (TEMPORARY - via curl)

**Right now, there's no UI for this, so we need to use curl:**

```bash
# Terminal 3: Approve permissions
curl -X POST http://127.0.0.1:4001/plan/approve \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "balanced",
    "allowedDirectories": ["/tmp", "/home/dp"],
    "allowedOperations": ["read", "write", "exec"]
  }'
```

**Important:** Replace `/home/dp` with your actual home directory path.

### Step 5: Test in UI

1. Go to http://localhost:3000
2. Type in chat: `list files in /tmp`
3. Should work! The agent will list files via HTTP API

## What Should Happen

### ✅ If Everything Works:

1. **Agent connects** → You see "Agent Connected" in sidebar
2. **You approve permissions** → Agent accepts operations
3. **You type command in chat** → LLM generates tool call
4. **Tool executes** → Goes through HTTP API to agent
5. **Result shows** → You see the output in chat

### ❌ If Something Fails:

**"Agent not connected" error:**
- Check agent is running
- Check user ID matches
- Check agent terminal for errors

**"Permission denied" error:**
- You need to approve permissions first (Step 4)
- Check allowed directories include the path you're using

**"Agent HTTP API failed" error:**
- Check agent HTTP server is running (should see port 4001 message)
- Check firewall isn't blocking localhost:4001

## Quick Test Commands

Try these in the chat UI:

1. `list files in /tmp` - Should list files
2. `read /tmp/some-file.txt` - Should read file (if exists)
3. `run ls -la /tmp` - Should execute command
4. `write test.txt in /tmp with content "hello"` - Should write file

## Current Limitations

1. **No UI for plan approval** - Must use curl (we'll fix this)
2. **WebSocket may close** - But HTTP API works around this
3. **Must manually approve** - No automatic approval yet

## Next Steps (To Make It Easier)

We need to add:
1. **Permission approval UI** - Button to approve permissions
2. **Mode selection** - Choose Safe/Balanced/Unrestricted
3. **Directory selection** - Choose allowed directories
4. **Status display** - Show current permissions

But for now, you can test with curl approval!

