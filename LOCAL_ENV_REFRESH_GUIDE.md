# Complete Local Environment Refresh Guide

## Quick Start: Refresh Your Local Environment

### Step 1: Clear All Local Storage

**Open Browser Console (F12) and run:**

```javascript
// Clear all op15-related localStorage keys
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

**Or use the built-in function:**
```javascript
// After running the script above once, you can use:
clearOp15Storage();
```

### Step 2: Sign Out and Sign Back In

1. Click "Sign Out" in the top header (this now automatically clears all localStorage)
2. Create a new account or sign in with existing account
3. The UI should now show correctly

### Step 3: Enable Local Environment

1. Toggle "Local Environment" switch in sidebar (should be ON by default)
2. You should see:
   - Workspace Selector
   - Agent Auto-Installer button

### Step 4: Download and Install Agent

1. **Build the agent first:**
   ```bash
   cd local-agent
   npm install
   npm run build
   ```

2. **Get your Clerk User ID:**
   - Open browser console (F12)
   - Run: `fetch('/api/users/workspace').then(r => r.json()).then(d => console.log('Check Network tab for userId'))`
   - Or check Clerk Dashboard → Users → Copy User ID

3. **Download agent installer:**
   - Click "Install Local Agent" button in sidebar
   - Or visit: `http://localhost:3000/api/agent/download?platform=linux` (replace `linux` with `darwin` for macOS or `win32` for Windows)

4. **Install and run:**
   ```bash
   # Linux/macOS
   chmod +x op15-agent-installer.sh
   ./op15-agent-installer.sh user_YOUR_CLERK_ID
   
   # Windows
   op15-agent-installer.bat user_YOUR_CLERK_ID
   ```

### Step 5: Verify Agent Connection

**Look for green "Agent Connected" indicator:**
- Should appear in sidebar footer
- Shows: 🟢 Agent Connected

**If not showing, check:**
1. ✅ Is local environment enabled? (Toggle in sidebar)
2. ✅ Is agent actually running? (Check terminal/server logs)
3. ✅ Does workspace API return `userHomeDirectory`?
   ```javascript
   // In browser console:
   fetch('/api/users/user_YOUR_ID/workspace')
     .then(r => r.json())
     .then(d => console.log('Config:', d));
   // Should show userHomeDirectory if agent connected
   ```

## What Was Fixed

### ✅ Comprehensive localStorage Cleanup

**Updated Components:**
1. `components/auth/user-button-with-clear.tsx` - Clears all keys on sign out
2. `components/layout/top-header.tsx` - Clears all keys on sign out
3. `contexts/chat-context.tsx` - Clears all keys when user not authenticated

**Keys Cleared:**
- `op15-chats` - Chat history
- `op15-active-chat-id` - Active chat ID
- `op15-local-env-enabled` - Local environment toggle
- `op15-agent-installed` - Agent installation status
- `localEnvSelectedDir` - Browser bridge selected directory
- `localEnvUserId` - User ID for local env
- Any other keys starting with `op15-` or `localEnv`

### ✅ Agent Status Detection

The green "Agent Connected" icon appears when:
1. User is signed in
2. Local environment is enabled
3. Agent is connected (checked via workspace API)
4. Workspace API returns `userHomeDirectory`

**How it works:**
1. Agent connects → sends `agent-metadata` with `homeDirectory`
2. Server stores in `global.agentMetadata` Map
3. Workspace API (`/api/users/[userId]/workspace`) reads from `global.agentMetadata`
4. Agent status footer checks workspace API for `userHomeDirectory`
5. If `userHomeDirectory` exists → show green icon ✅

## Troubleshooting

### Issue: UI Not Showing After Account Deletion/Recreation

**Solution:**
1. Clear localStorage (use script above)
2. Clear browser cache:
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Firefox: Settings → Privacy → Clear Data → Cached Web Content
3. Hard refresh: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (macOS)
4. Sign out completely
5. Sign in again

### Issue: Green Icon Not Showing

**Check:**
1. ✅ Local environment enabled? (Toggle in sidebar)
2. ✅ Agent running? (Check terminal/server logs)
3. ✅ Workspace API returns `userHomeDirectory`?
   ```bash
   curl http://localhost:3000/api/users/user_YOUR_ID/workspace
   ```
4. ✅ Check browser console for errors
5. ✅ Hard refresh page

**Debug:**
```javascript
// In browser console:
fetch('/api/users/user_YOUR_ID/workspace')
  .then(r => r.json())
  .then(d => {
    console.log('Workspace config:', d);
    console.log('Has userHomeDirectory:', !!d.userHomeDirectory);
  });
```

### Issue: Agent Won't Connect

**Check:**
1. ✅ Next.js server running? (`npm run dev`)
2. ✅ Agent using correct URL? (`http://localhost:3000` for dev)
3. ✅ User ID correct? (Check Clerk Dashboard)
4. ✅ Check agent terminal for errors
5. ✅ Check server logs for connection attempts

**Common Errors:**
- `WebSocket connection rejected: only agent connections are supported` → Make sure you're using the agent, not browser bridge
- `Connection refused` → Server not running or wrong URL
- `Unauthorized` → User ID doesn't match authenticated user

## Files Created/Updated

### New Files:
1. `lib/utils/local-storage-cleanup.ts` - Cleanup utility (for future use)
2. `docs/AGENT_DOWNLOAD_AND_TEST_GUIDE.md` - Comprehensive agent guide
3. `scripts/clear-local-storage.js` - Browser console script
4. `LOCAL_ENV_REFRESH_GUIDE.md` - This file

### Updated Files:
1. `components/auth/user-button-with-clear.tsx` - Enhanced localStorage cleanup
2. `components/layout/top-header.tsx` - Enhanced localStorage cleanup
3. `contexts/chat-context.tsx` - Enhanced localStorage cleanup

## Testing Checklist

After refreshing your local environment:

- [ ] Clear localStorage (browser console script)
- [ ] Sign out
- [ ] Sign in with new/existing account
- [ ] UI shows correctly (sidebar, header, etc.)
- [ ] Enable local environment toggle
- [ ] Build agent (`cd local-agent && npm install && npm run build`)
- [ ] Download agent installer (click button in sidebar)
- [ ] Install agent with your Clerk User ID
- [ ] Verify agent connects (check server logs)
- [ ] Green "Agent Connected" icon appears in sidebar footer
- [ ] Test with LLM: "What files are in my Desktop?"
- [ ] Should show YOUR files (not cloud server's)

## Quick Reference

**Clear localStorage:**
```javascript
// Browser console:
const keys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
    keys.push(key);
  }
}
keys.forEach(k => localStorage.removeItem(k));
window.location.reload();
```

**Check agent status:**
```bash
# Terminal:
curl http://localhost:3000/api/users/user_YOUR_ID/workspace | jq

# Browser console:
fetch('/api/users/user_YOUR_ID/workspace')
  .then(r => r.json())
  .then(d => console.log(d));
```

**Get Clerk User ID:**
- Clerk Dashboard → Users → Copy User ID
- Or check server logs when signing in
- Or check Network tab in browser DevTools

## Next Steps

1. ✅ localStorage cleanup is now comprehensive
2. ✅ Sign out clears all keys automatically
3. ✅ Agent status detection works correctly
4. ✅ Documentation created

**You're ready to test!** Follow the steps above to refresh your local environment and test the agent connection.

