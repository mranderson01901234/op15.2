# Testing Guide - How to Use in UI (localhost:3000)

## ✅ What You Can Do Now

You can now test everything in the UI at **http://localhost:3000**!

## Step-by-Step Instructions

### 1. Start the Server

```bash
# Terminal 1
cd /home/dp/Desktop/op15
pnpm dev
```

Wait for: `> Ready on http://localhost:3000`

### 2. Start the Agent

```bash
# Terminal 2
cd /home/dp/Desktop/op15/local-agent
pnpm build
node dist/index.js http://localhost:3000 YOUR_USER_ID
```

**To find your user ID:**
- Open http://localhost:3000
- Log in
- Check browser console: `localStorage.getItem('localEnvUserId')`
- Or look at the URL when you're logged in

**You should see:**
```
✅ Connected to cloud server
🔒 HTTP API listening on http://127.0.0.1:4001
```

### 3. Open the UI

1. Go to **http://localhost:3000**
2. Log in if needed
3. Look at the **sidebar** - you should see:
   - "Agent Connected" (green dot)
   - **"Agent Permissions" panel** (NEW!)

### 4. Approve Permissions

In the sidebar, you'll see a panel with three buttons:
- **Safe** - Read-only
- **Balanced** - Read/write/exec in common directories (recommended)
- **Unrestricted** - Full access

**Click "Balanced"** (or whichever you prefer)

You should see: ✅ "Permissions approved! Mode: balanced"

### 5. Test Commands in Chat

Now you can use the chat! Try:

1. **List files:**
   ```
   list files in /tmp
   ```

2. **Read a file:**
   ```
   read /tmp/some-file.txt
   ```

3. **Run a command:**
   ```
   run ls -la /tmp
   ```

4. **Write a file:**
   ```
   write test.txt in /tmp with content "hello world"
   ```

## What Should Happen

### ✅ Success Flow:

1. Agent connects → "Agent Connected" appears
2. You approve permissions → Panel shows "Approved"
3. You type command → LLM processes it
4. Tool executes → Goes through HTTP API
5. Result appears → You see output in chat

### ❌ If Something Fails:

**"Agent not connected":**
- Check agent is running in Terminal 2
- Check user ID matches
- Refresh the page

**"Permission denied":**
- Click "Balanced" or "Unrestricted" button
- Make sure you see "Permissions approved!" message

**"Agent HTTP API failed":**
- Check agent terminal shows "HTTP API listening on port 4001"
- Check no firewall blocking localhost:4001

**Panel doesn't appear:**
- Make sure agent is connected (green dot)
- Refresh the page
- Check browser console for errors

## Current Features

✅ **Agent Connection Status** - Shows in sidebar
✅ **Permission Approval UI** - Click button to approve
✅ **HTTP API Integration** - Operations use HTTP (more reliable)
✅ **Permission Enforcement** - Operations checked before execution
✅ **Action Logging** - All actions logged

## What's Next

- Kill switch button (to stop agent)
- Logs viewer (to see what agent did)
- Plan preview (before executing multi-step operations)

But for now, **you can test everything in the UI!**

## Quick Test Checklist

- [ ] Server running (localhost:3000)
- [ ] Agent running (Terminal 2)
- [ ] "Agent Connected" shows in sidebar
- [ ] "Agent Permissions" panel appears
- [ ] Click "Balanced" button
- [ ] See "Permissions approved!" message
- [ ] Type "list files in /tmp" in chat
- [ ] See file list in response

If all checkboxes work, you're good to go! 🎉

