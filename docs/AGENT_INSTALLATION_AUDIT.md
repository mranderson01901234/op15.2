# Agent Installation Pipeline Audit

## Current Flow: Click "Install Local Agent" → Connected

### Step-by-Step Breakdown

#### **Step 1: User Clicks "Install Local Agent" Button**
- **Location**: `components/local-env/agent-auto-installer.tsx` (line 227)
- **Action**: Opens `InstallAgentModal`
- **Status**: ✅ Automated (1 click)

#### **Step 2: Modal Opens - User Clicks "Authorize Install"**
- **Location**: `components/local-env/install-agent-modal.tsx` (line 333)
- **Action**: `handleAuthorizeInstall()` function
- **Status**: ✅ Automated (1 click)

#### **Step 3: Download Installer Script**
- **Location**: `app/api/agent/download/route.ts`
- **Action**: Fetches installer script from `/api/agent/download?platform=X&userId=Y`
- **What it does**:
  - Reads `local-agent/dist/index.js`
  - Generates Node.js installer script with embedded agent code
  - Pre-configures `SERVER_URL` and `USER_ID`
- **Status**: ✅ Automated

#### **Step 4: Save Installer File**
- **Location**: `components/local-env/install-agent-modal.tsx` (line 54)
- **Action**: Uses File System Access API `showSaveFilePicker()`
- **What happens**:
  - User selects save location
  - File saved as `op15-agent-installer.js`
- **Status**: ⚠️ **Requires user interaction** (file picker dialog)
- **Issue**: User must choose where to save

#### **Step 5: Attempt Auto-Execution** ❌ **FAILS HERE**
- **Location**: `components/local-env/install-agent-modal.tsx` (line 79)
- **Current Attempt**: Tries to execute via browser bridge `exec.run`
- **Problem**: Browser bridge requires agent to already be connected (circular dependency)
- **Status**: ❌ **Cannot auto-execute** - Browser security prevents direct script execution
- **Result**: User sees message "Installer saved! Run: node op15-agent-installer.js"

#### **Step 6: Manual Script Execution** ❌ **MANUAL STEP REQUIRED**
- **User Action**: Open terminal, navigate to saved file, run `node op15-agent-installer.js`
- **Status**: ❌ **Manual step** - User must:
  1. Open terminal/command prompt
  2. Navigate to download location
  3. Type command: `node op15-agent-installer.js`
- **Failure Point**: If Node.js not installed, script exits with error message

#### **Step 7: Installer Checks Node.js** ⚠️ **CAN FAIL**
- **Location**: `app/api/agent/download/route.ts` (line 141)
- **Code**: `execSync('node --version', { stdio: 'ignore' })`
- **On Failure**: 
  ```javascript
  console.error('❌ Node.js is not installed. Please install Node.js 20+ first.');
  process.exit(1);
  ```
- **Status**: ⚠️ **Fails silently** - User sees error, no recovery path
- **Issue**: No automatic Node.js installation or detection

#### **Step 8: Installer Creates Agent Directory**
- **Location**: `app/api/agent/download/route.ts` (line 107)
- **Action**: Creates `~/.op15-agent` directory
- **Status**: ✅ Automated

#### **Step 9: Installer Writes Agent Files**
- **Location**: `app/api/agent/download/route.ts` (line 114)
- **Action**: 
  - Writes `agent.js` (the actual agent code)
  - Writes `start.sh` or `start.bat` (launcher script)
- **Status**: ✅ Automated

#### **Step 10: Installer Installs Dependencies**
- **Location**: `app/api/agent/download/route.ts` (line 149)
- **Action**: Runs `npm install ws@^8.14.2 --no-save --silent`
- **Status**: ✅ Automated (but can fail silently)

#### **Step 11: Installer Sets Up System Service** ⚠️ **REQUIRES SUDO**
- **Location**: `app/api/agent/download/route.ts` (line 192-226)
- **Linux**: Creates systemd service
  - Requires `sudo` to write to `/etc/systemd/system/`
  - Code: `execSync('sudo tee /etc/systemd/system/op15-agent.service')`
  - **Status**: ⚠️ **Requires manual password input** (sudo prompt)
- **macOS**: Creates launchd plist
  - Writes to `~/Library/LaunchAgents/`
  - **Status**: ✅ Automated (no sudo needed)
- **Windows**: Creates startup script
  - Writes to `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`
  - **Status**: ✅ Automated

#### **Step 12: Installer Starts Agent**
- **Location**: `app/api/agent/download/route.ts` (line 181-187, 220-225)
- **Action**: Spawns agent process in background
- **Status**: ✅ Automated (but may fail if service setup failed)

#### **Step 13: Agent Connects to Server**
- **Location**: `local-agent/index.ts` (line 168)
- **Action**: Connects WebSocket to `wss://SERVER_URL/api/bridge`
- **Status**: ✅ Automated (if agent started successfully)

#### **Step 14: UI Checks Connection Status**
- **Location**: `components/local-env/agent-auto-installer.tsx` (line 21)
- **Action**: Polls `/api/users/[userId]/agent-status` every 10 seconds
- **Status**: ✅ Automated

---

## Critical Issues & Bottlenecks

### 🔴 **Critical Issue #1: Manual Script Execution Required**
**Location**: Step 5-6
- **Problem**: Browser cannot execute local scripts due to security restrictions
- **Impact**: User must manually open terminal and run command
- **User Experience**: Poor - breaks the "one-click" promise

### 🔴 **Critical Issue #2: Node.js Check Fails Silently**
**Location**: Step 7
- **Problem**: If Node.js not installed, script exits with error message
- **Impact**: User sees error but no guidance on how to install Node.js
- **User Experience**: Confusing - user doesn't know what to do next

### 🟡 **Warning Issue #3: Sudo Password Required (Linux)**
**Location**: Step 11
- **Problem**: Linux systemd service setup requires sudo password
- **Impact**: User must manually enter password during installation
- **User Experience**: Acceptable but not ideal - breaks automation flow

### 🟡 **Warning Issue #4: No Progress Feedback**
**Location**: Steps 8-12
- **Problem**: Installer runs silently, user doesn't know what's happening
- **Impact**: User may think installation failed if it takes time
- **User Experience**: Unclear - no visual feedback

### 🟡 **Warning Issue #5: No Error Recovery**
**Location**: Throughout
- **Problem**: If any step fails, installation stops with error message
- **Impact**: User must restart entire process
- **User Experience**: Frustrating - no retry mechanism

### 🟡 **Warning Issue #6: File System Access API Dialog**
**Location**: Step 4
- **Problem**: User must interact with file picker dialog
- **Impact**: Extra click required
- **User Experience**: Acceptable but could be streamlined

---

## Current Manual Steps Required

1. ✅ Click "Install Local Agent" button
2. ✅ Click "Authorize Install" button
3. ⚠️ Select save location (file picker dialog)
4. ❌ **Open terminal/command prompt**
5. ❌ **Navigate to download location**
6. ❌ **Type: `node op15-agent-installer.js`**
7. ⚠️ **Enter sudo password (Linux only)** - if systemd service setup fails, user must manually start agent

**Total Clicks**: 2-3 clicks + manual terminal work

---

## Ideal Flow (Zero Manual Steps)

### **Target**: One-click installation with zero manual intervention

1. ✅ Click "Install Local Agent" button
2. ✅ Click "Authorize Install" button
3. ✅ **Auto-detect Node.js** (or provide installer)
4. ✅ **Auto-execute installer** (via browser bridge or alternative method)
5. ✅ **Auto-handle sudo** (or use user-level service)
6. ✅ **Show real-time progress** (WebSocket or polling)
7. ✅ **Auto-verify connection** (poll until connected)

**Total Clicks**: 2 clicks

---

## Solutions to Consider

### **Solution 1: Browser Extension Approach**
- Create browser extension that can execute local scripts
- **Pros**: Can auto-execute installer
- **Cons**: Requires extension installation (adds complexity)

### **Solution 2: Electron App**
- Package as Electron app instead of web app
- **Pros**: Full system access, can execute scripts
- **Cons**: Requires app installation (defeats purpose)

### **Solution 3: Native Installer Packages**
- Create platform-specific installers (.deb, .rpm, .pkg, .exe)
- **Pros**: Standard installation flow, can auto-start
- **Cons**: Requires building multiple packages, more complex

### **Solution 4: Browser Bridge Pre-Connection**
- Use browser bridge to execute installer BEFORE agent connects
- **Pros**: Leverages existing infrastructure
- **Cons**: Requires browser bridge to be connected first (circular dependency)

### **Solution 5: Hybrid Approach (Recommended)**
1. **Check for Node.js** before download
   - If not found, provide download link/instructions
   - Or bundle Node.js installer
2. **Use browser bridge** if available (for reinstall scenarios)
3. **For first install**: Provide clear instructions + auto-detect when agent connects
4. **Progress tracking**: Poll server for connection status, show progress
5. **User-level service**: Avoid sudo requirement (use user systemd service or launchd)

---

## Recommended Implementation Plan

### **Phase 1: Eliminate Manual Script Execution**
- **Option A**: Use browser bridge `exec.run` to execute installer (if bridge connected)
- **Option B**: Create platform-specific launchers (.bat, .sh) that auto-execute
- **Option C**: Use File System Access API to write installer, then use `window.open()` to trigger execution

### **Phase 2: Handle Node.js Detection**
- Check for Node.js before download
- If not found, show clear instructions with download links
- Or bundle Node.js installer for each platform

### **Phase 3: Eliminate Sudo Requirement (Linux)**
- Use user-level systemd service (`~/.config/systemd/user/`)
- Or use launchd for macOS (already user-level)
- Or provide option to skip service setup and run manually

### **Phase 4: Add Progress Feedback**
- Show installation steps in modal
- Poll server for connection status
- Show real-time progress updates

### **Phase 5: Error Recovery**
- Retry failed steps automatically
- Provide clear error messages with recovery actions
- Allow user to retry installation from UI

---

## Next Steps

1. **Immediate**: Fix Node.js detection and error messages
2. **Short-term**: Implement browser bridge execution for reinstall scenarios
3. **Medium-term**: Create user-level service setup (eliminate sudo)
4. **Long-term**: Consider native installer packages for true one-click install

