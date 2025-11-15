# Agent Download and Testing Guide

## Complete Local Environment Refresh

### Step 1: Clear All Local Storage

**Option A: Use Browser Console**
```javascript
// Open browser console (F12) and run:
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
    keysToRemove.push(key);
  }
}
keysToRemove.forEach(key => localStorage.removeItem(key));
console.log('✅ Cleared keys:', keysToRemove);
window.location.reload();
```

**Option B: Clear via Sign Out**
1. Click "Sign Out" in the top header
2. This automatically clears all localStorage keys
3. Create a new account or sign in with existing account

### Step 2: Build the Agent

Before downloading, ensure the agent is built:

```bash
cd local-agent
npm install
npm run build
```

This creates `local-agent/dist/index.js` which is required for the download endpoint.

### Step 3: Download the Agent

**Method 1: Via Web UI (Recommended)**

1. **Sign in** to your application
2. **Enable Local Environment** - Toggle "Local Environment" switch in sidebar (should be ON by default)
3. **Click "Install Local Agent"** button in the sidebar
4. The installer script will download automatically:
   - Linux/macOS: `op15-agent-installer.sh`
   - Windows: `op15-agent-installer.bat`

**Method 2: Direct Download via API**

```bash
# Get your Clerk User ID first (see below)
# Then download:
curl -H "Cookie: $(cat .cookies)" \
  "http://localhost:3000/api/agent/download?platform=linux" \
  -o op15-agent-installer.sh

# Or for macOS:
curl -H "Cookie: $(cat .cookies)" \
  "http://localhost:3000/api/agent/download?platform=darwin" \
  -o op15-agent-installer.sh

# Or for Windows:
curl -H "Cookie: $(cat .cookies)" \
  "http://localhost:3000/api/agent/download?platform=win32" \
  -o op15-agent-installer.bat
```

### Step 4: Get Your Clerk User ID

**Method 1: Browser Console**
```javascript
// While signed in, open browser console (F12):
fetch('/api/health')
  .then(() => {
    // Check Network tab for requests with userId
    console.log('Check Network tab for API calls with userId');
  });

// Or check the workspace API:
fetch('/api/users/workspace')
  .then(r => r.json())
  .then(d => console.log('User data:', d));
```

**Method 2: Check Clerk Dashboard**
1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to Users
3. Find your user and copy the User ID (starts with `user_`)

**Method 3: Check Server Logs**
When you sign in, check your Next.js server logs - it will show the userId in authentication logs.

### Step 5: Install and Run the Agent

**Linux/macOS:**
```bash
# Make installer executable
chmod +x op15-agent-installer.sh

# Run installer with your user ID
./op15-agent-installer.sh user_YOUR_CLERK_ID

# The installer will:
# 1. Create ~/.op15-agent directory
# 2. Install agent code
# 3. Install Node.js dependencies (ws package)
# 4. Create system service (systemd on Linux, launchd on macOS)
# 5. Start the agent automatically
```

**Windows:**
```batch
REM Run installer with your user ID
op15-agent-installer.bat user_YOUR_CLERK_ID

REM Or double-click and enter your user ID when prompted
```

**Manual Run (Alternative):**
```bash
# Build agent first
cd local-agent
npm install
npm run build

# Run manually (replace with your server URL and user ID)
node dist/index.js http://localhost:3000 user_YOUR_CLERK_ID
```

### Step 6: Verify Agent Connection

**Check Agent Status:**

1. **In Browser:**
   - Look for green "Agent Connected" indicator in sidebar footer
   - Should show: 🟢 Agent Connected

2. **In Agent Terminal:**
   ```
   ✅ Connected to cloud server
   📁 Indexing filesystem (shallow scan)...
   ✅ Filesystem indexed: X directories, Y paths
   Agent is running. Press Ctrl+C to stop.
   ```

3. **In Server Logs:**
   ```
   ✅ Local agent connected successfully { userId: 'user_xxx', type: 'agent' }
   ```

4. **Via API:**
   ```bash
   # Check workspace config (should show userHomeDirectory if agent connected)
   curl http://localhost:3000/api/users/user_YOUR_ID/workspace
   ```

### Step 7: Test Agent Functionality

**Test 1: List Files**
- Ask LLM: "What files are in my Desktop?"
- Should show YOUR Desktop files (not cloud server's)

**Test 2: System Info**
- Ask LLM: "What is my operating system?"
- Should show YOUR system info (e.g., "Linux 6.14.0-35-generic")

**Test 3: Create File**
- Ask LLM: "Create a test file called hello.txt in my Desktop"
- Should create file on YOUR machine

**Test 4: Read File**
- Ask LLM: "Read the hello.txt file from my Desktop"
- Should read YOUR file

### Troubleshooting

#### Issue: Agent Won't Download

**Problem:** "Agent not available. Please build the agent first."

**Solution:**
```bash
cd local-agent
npm install
npm run build
# Verify dist/index.js exists
ls -la dist/index.js
```

#### Issue: Agent Won't Connect

**Check:**
1. ✅ Is Next.js server running? (`npm run dev`)
2. ✅ Is agent using correct URL? (`http://localhost:3000` for dev)
3. ✅ Is userId correct? (Check Clerk Dashboard)
4. ✅ Check agent terminal for error messages
5. ✅ Check server logs for connection attempts

**Common Errors:**
- `WebSocket connection rejected: only agent connections are supported` - Make sure you're using the agent, not browser bridge
- `Connection refused` - Server not running or wrong URL
- `Unauthorized` - User ID doesn't match authenticated user

#### Issue: Green Icon Not Showing

**Check:**
1. ✅ Is local environment enabled? (Toggle in sidebar)
2. ✅ Is agent actually connected? (Check server logs)
3. ✅ Does workspace API return `userHomeDirectory`?
   ```bash
   curl http://localhost:3000/api/users/user_YOUR_ID/workspace
   ```
4. ✅ Check browser console for errors
5. ✅ Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)

**Debug:**
```javascript
// In browser console:
fetch('/api/users/user_YOUR_ID/workspace')
  .then(r => r.json())
  .then(d => console.log('Workspace config:', d));
// Should show userHomeDirectory if agent connected
```

#### Issue: UI Not Showing After Account Deletion/Recreation

**Problem:** Signed-in UI doesn't appear after deleting account and creating new one.

**Solution:**
1. **Clear all localStorage:**
   ```javascript
   // In browser console:
   localStorage.clear();
   window.location.reload();
   ```

2. **Clear browser cache:**
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Firefox: Settings → Privacy → Clear Data → Cached Web Content

3. **Hard refresh:**
   - Windows/Linux: `Ctrl + Shift + R`
   - macOS: `Cmd + Shift + R`

4. **Check Clerk session:**
   - Sign out completely
   - Clear Clerk cookies
   - Sign in again

#### Issue: Agent Status Not Updating

**Problem:** Agent connected but green icon not showing.

**Solution:**
1. Check `AgentStatusFooter` component is rendering:
   ```javascript
   // Component checks:
   // - user is loaded
   // - local environment is enabled
   // - agent is connected (userHomeDirectory exists)
   ```

2. Force refresh workspace config:
   ```javascript
   // In browser console:
   fetch('/api/users/user_YOUR_ID/workspace', { cache: 'no-store' })
     .then(r => r.json())
     .then(d => console.log('Config:', d));
   ```

3. Check component is mounted:
   - Look for `AgentStatusFooter` in sidebar footer
   - Should be visible when agent connected

### Service Management

**Linux (systemd):**
```bash
# Check status
sudo systemctl status op15-agent

# Start/stop
sudo systemctl start op15-agent
sudo systemctl stop op15-agent

# View logs
sudo journalctl -u op15-agent -f

# Restart
sudo systemctl restart op15-agent
```

**macOS (launchd):**
```bash
# Check status
launchctl list | grep op15

# Load/unload
launchctl load ~/Library/LaunchAgents/com.op15.agent.plist
launchctl unload ~/Library/LaunchAgents/com.op15.agent.plist

# View logs
log show --predicate 'process == "op15-agent"' --last 1h
```

**Windows:**
```batch
REM Check if running
tasklist | findstr op15

REM Start manually
%USERPROFILE%\.op15-agent\start.bat

REM To install as service (requires nssm):
nssm install op15-agent "%USERPROFILE%\.op15-agent\start.bat"
nssm start op15-agent
```

### Complete Reset Checklist

If you need to completely reset your local environment:

- [ ] Stop agent (Ctrl+C or systemctl stop)
- [ ] Clear localStorage (browser console script above)
- [ ] Clear browser cache
- [ ] Sign out from Clerk
- [ ] Hard refresh page (Ctrl+Shift+R)
- [ ] Sign in with new/existing account
- [ ] Enable local environment toggle
- [ ] Download agent installer
- [ ] Install and run agent
- [ ] Verify green "Agent Connected" icon appears
- [ ] Test with LLM commands

### Quick Test Script

```bash
#!/bin/bash
# Quick agent test script

echo "🔍 Checking agent status..."

# Check if agent is running
if pgrep -f "op15-agent\|local-agent" > /dev/null; then
  echo "✅ Agent process found"
else
  echo "❌ Agent not running"
fi

# Check if agent directory exists
if [ -d "$HOME/.op15-agent" ]; then
  echo "✅ Agent directory exists: $HOME/.op15-agent"
else
  echo "❌ Agent directory not found"
fi

# Check if agent code exists
if [ -f "$HOME/.op15-agent/agent.js" ]; then
  echo "✅ Agent code found"
else
  echo "❌ Agent code not found"
fi

# Check systemd service (Linux)
if command -v systemctl &> /dev/null; then
  if systemctl is-active --quiet op15-agent; then
    echo "✅ Agent service is running"
  else
    echo "⚠️  Agent service not active"
  fi
fi

echo ""
echo "To start agent manually:"
echo "  cd $HOME/.op15-agent"
echo "  node agent.js http://localhost:3000 user_YOUR_ID"
```

Save as `check-agent.sh`, make executable (`chmod +x check-agent.sh`), and run it.

