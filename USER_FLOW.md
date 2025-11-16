# Complete User Flow - Local Environment Feature

## For New Users

### Step 1: Sign In
- User signs in to http://localhost:3000
- Clerk authentication handles this

### Step 2: Enable Local Environment
- User sees "Local Environment" toggle in sidebar
- Toggle it **ON**
- Installer automatically downloads (or user clicks "Install Local Agent")

### Step 3: Install Agent
**Option A: Use Installer (Recommended)**
1. Installer script downloads automatically
2. User runs the installer script:
   - Linux/Mac: `chmod +x op15-agent-installer.sh && ./op15-agent-installer.sh`
   - Windows: Double-click `op15-agent-installer.bat`
3. Installer:
   - Builds the agent
   - Starts the agent with user's ID
   - Agent connects to server

**Option B: Manual Installation**
1. User sees connection guide in sidebar
2. Copies the command
3. Runs manually:
   ```bash
   cd local-agent
   pnpm build
   node dist/index.js http://localhost:3000 USER_ID
   ```

### Step 4: Agent Connects
- Agent connects via WebSocket (may close, but HTTP API works)
- Agent sends metadata (home directory, HTTP port)
- UI shows "Agent Connected" status

### Step 5: Approve Permissions
- "Agent Permissions" panel appears in sidebar
- User clicks one of three buttons:
  - **Safe**: Read-only access
  - **Balanced**: Read/write/exec in common directories (recommended)
  - **Unrestricted**: Full access
- Permissions are set in agent daemon

### Step 6: Use Features
- User can now use chat to:
  - List files: `list files in /tmp`
  - Read files: `read /path/to/file.txt`
  - Write files: `write file.txt in /tmp with content "hello"`
  - Run commands: `run ls -la /tmp`
  - Move/delete files: `move file.txt to /tmp/newfile.txt`

## UI Components Flow

### When Local Environment is OFF
- Only "Local Environment" toggle visible
- No other components shown

### When Local Environment is ON but Agent Not Connected
1. **Workspace Selector** - Always visible
2. **Connection Guide** - Shows instructions
3. **Agent Auto-Installer** - Shows "Install Local Agent" button

### When Agent is Connected
1. **Workspace Selector** - Always visible
2. **Agent Permissions Panel** - Shows permission approval buttons
3. **Agent Auto-Installer** - Shows "Agent connected" status

### After Permissions Approved
1. **Workspace Selector** - Always visible
2. **Agent Permissions Panel** - Shows current permissions (mode, operations, directories)
3. **Agent Auto-Installer** - Shows "Agent connected" status

## Status Indicators

### Connection Status
- 🟢 **Green dot** = Agent connected (HTTP API available)
- 🟡 **Yellow dot** = Agent installed but not connected
- ⚪ **No dot** = Agent not installed

### Permission Status
- ✅ **Approved** = Permissions set, ready to use
- ⚠️ **Not Approved** = Need to click approval button

## Error States

### "Agent not connected"
- **Cause**: Agent not running or not connected
- **Solution**: Run installer or start agent manually

### "Permission denied"
- **Cause**: No permissions approved yet
- **Solution**: Click "Balanced" or "Unrestricted" button

### "Agent HTTP API failed"
- **Cause**: Agent HTTP server not running
- **Solution**: Restart agent

## Complete Flow Diagram

```
User Signs In
    ↓
Toggle "Local Environment" ON
    ↓
Installer Downloads (auto or manual)
    ↓
User Runs Installer
    ↓
Agent Starts & Connects
    ↓
UI Shows "Agent Connected"
    ↓
User Clicks "Balanced" (or Safe/Unrestricted)
    ↓
Permissions Approved
    ↓
User Can Use Features!
```

## Testing Checklist

- [ ] Sign in works
- [ ] Toggle "Local Environment" ON
- [ ] Installer downloads
- [ ] Agent installs and connects
- [ ] "Agent Connected" shows in UI
- [ ] "Agent Permissions" panel appears
- [ ] Click "Balanced" button
- [ ] See "Permissions approved!" message
- [ ] Try `list files in /tmp` in chat
- [ ] See file list in response
- [ ] Try `run ls -la /tmp` in chat
- [ ] See command output

## Notes

- **HTTP API is primary**: Operations use HTTP API, not WebSocket
- **WebSocket may close**: That's okay, HTTP API still works
- **Permissions required**: Must approve before operations work
- **Localhost only**: Agent HTTP API only listens on 127.0.0.1 (secure)

