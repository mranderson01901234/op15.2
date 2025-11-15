# Streamlined Installation Flow

## Current Implementation

### User Flow:
1. ✅ **User creates account** - Clerk authentication
2. ✅ **User signs in** - Clerk session established
3. ✅ **User clicks "Local Environment" toggle** - Enables local environment features
4. ✅ **Installer automatically downloads** - Pre-configured with user ID and server URL
5. ✅ **User runs installer** - One command or double-click
6. ✅ **Agent auto-installs and connects** - No manual configuration needed

## How It Works

### Step 1: Enable Local Environment
- User toggles "Local Environment" switch in sidebar
- System checks if agent is already connected
- If not connected, automatically downloads installer script

### Step 2: Auto-Download Installer
- Installer is pre-configured with:
  - ✅ Server URL (from `NEXT_PUBLIC_APP_URL` env var)
  - ✅ User ID (embedded in script)
- No manual configuration needed
- Downloads to browser's default download location

### Step 3: Run Installer
**Linux/macOS:**
```bash
# Option 1: Make executable and run
chmod +x op15-agent-installer.sh
./op15-agent-installer.sh

# Option 2: Run directly (if browser sets permissions)
./op15-agent-installer.sh

# The user ID is already embedded, no need to provide it!
```

**Windows:**
```batch
REM Just double-click the .bat file
REM Or run:
op15-agent-installer.bat

REM User ID is already embedded!
```

### Step 4: Auto-Installation
The installer script:
1. Creates `~/.op15-agent` directory
2. Installs agent code
3. Installs Node.js dependencies (`ws` package)
4. Creates system service (systemd/launchd)
5. Starts agent automatically
6. Agent connects to server with embedded user ID

### Step 5: Connection Confirmed
- Agent sends metadata with `homeDirectory`
- Server stores in `global.agentMetadata`
- Workspace API returns `userHomeDirectory`
- Green "Agent Connected" icon appears in sidebar

## Technical Details

### Installer Pre-Configuration
The installer script is generated with:
- **Server URL**: From `process.env.NEXT_PUBLIC_APP_URL`
- **User ID**: From authenticated user's Clerk ID
- **Platform**: Auto-detected from user agent

### User ID Embedding
```bash
# In installer script:
USER_ID="user_abc123"  # Pre-configured
# User doesn't need to provide it!
```

### Auto-Start
- **Linux**: systemd service auto-starts on boot
- **macOS**: launchd service auto-starts on login
- **Windows**: Manual start (can be configured as service)

## Files Modified

1. **`components/local-env/local-env-toggle.tsx`**
   - Auto-downloads installer when local environment enabled
   - Pre-configures installer with user ID

2. **`app/api/agent/download/route.ts`**
   - Accepts user ID in query params or headers
   - Embeds user ID in installer script
   - Pre-configures server URL

3. **`components/local-env/agent-auto-installer.tsx`**
   - Updated instructions to reflect streamlined flow

## User Experience

### Before (Manual):
1. User enables local environment
2. User clicks "Install Local Agent"
3. User downloads installer
4. User opens terminal
5. User runs: `./op15-agent-installer.sh user_xxxxx`
6. User waits for installation
7. Agent connects

### After (Streamlined):
1. User enables local environment
2. ✅ Installer downloads automatically
3. User runs installer (double-click or one command)
4. ✅ Agent installs and connects automatically
5. ✅ Green icon appears

## Security

- ✅ User ID is authenticated via Clerk
- ✅ Installer only generated for authenticated users
- ✅ User ID embedded securely in script
- ✅ No sensitive data exposed
- ✅ Agent connects with authenticated user ID

## Browser Limitations

Browsers cannot:
- ❌ Auto-execute downloaded scripts (security restriction)
- ❌ Set executable permissions on downloaded files
- ❌ Run shell commands directly

**Solution:**
- ✅ Pre-configure installer with all needed info
- ✅ Provide clear one-click instructions
- ✅ Make installer as user-friendly as possible

## Future Enhancements

### Possible Improvements:
1. **Browser Extension** - Could auto-execute installer with user permission
2. **Electron App** - Desktop app could handle installation automatically
3. **Native Messaging** - Browser extension with native messaging host
4. **One-Click Install** - Package manager integration (Homebrew, Chocolatey, etc.)

### Current Status:
✅ **Streamlined as much as browser security allows**
✅ **One-click after download**
✅ **Pre-configured with all needed info**
✅ **Auto-starts on boot/login**

## Testing

### Test Flow:
1. Create new account
2. Sign in
3. Toggle "Local Environment" ON
4. ✅ Installer should download automatically
5. Check installer contains user ID
6. Run installer
7. ✅ Agent should connect automatically
8. ✅ Green icon should appear

### Expected Behavior:
- Installer downloads immediately when toggle enabled
- Installer contains pre-configured user ID
- Running installer requires no user input (except sudo password for Linux)
- Agent connects automatically
- Green icon appears within 10 seconds

