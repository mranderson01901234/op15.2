# Streamlined Agent Installation Plan

## Goal: Zero Manual Script Execution, Minimal Clicks

## Current State Analysis

**Manual Steps Required:**
1. Click "Install Local Agent" ✅
2. Click "Authorize Install" ✅
3. Select save location ⚠️
4. Open terminal ❌
5. Navigate to file ❌
6. Run `node op15-agent-installer.js` ❌
7. Enter sudo password (Linux) ⚠️

**Total**: 2 clicks + terminal work + potential sudo

---

## Target State: Streamlined Flow

**Steps Required:**
1. Click "Install Local Agent" ✅
2. Click "Authorize Install" ✅
3. **Auto-execute** installer (if possible) OR provide clear next steps ✅
4. **Auto-detect** connection ✅

**Total**: 2 clicks + automatic execution

---

## Implementation Strategy

### **Approach: Multi-Path Installation**

We'll support multiple installation paths based on what's available:

1. **Path A: Browser Bridge Available** (Reinstall scenarios)
   - Use browser bridge `exec.run` to execute installer
   - Fully automated, zero manual steps

2. **Path B: First Install** (No browser bridge)
   - Pre-flight checks (Node.js detection)
   - Smart file saving with auto-execution hints
   - Real-time connection polling
   - Clear progress feedback

3. **Path C: Platform-Specific Optimizations**
   - Windows: `.bat` wrapper for double-click execution
   - Linux/Mac: Make installer executable, provide one-command copy-paste

---

## Detailed Implementation Plan

### **Phase 1: Pre-Flight Checks** (Immediate)

#### 1.1 Node.js Detection Before Download
**File**: `components/local-env/install-agent-modal.tsx`

```typescript
// Before downloading installer, check if Node.js is available
const checkNodeJs = async () => {
  // Try to detect Node.js via browser bridge (if available)
  // Or show clear instructions if not detected
};
```

**Action Items**:
- [ ] Add Node.js detection before download
- [ ] If not detected, show download link + instructions
- [ ] If detected, proceed with download

#### 1.2 Improve Error Messages
**File**: `app/api/agent/download/route.ts`

**Current**: Script exits with error if Node.js not found
**New**: Provide helpful error message with download link

**Action Items**:
- [ ] Update Node.js check error message
- [ ] Include platform-specific Node.js download links
- [ ] Provide clear recovery instructions

---

### **Phase 2: Auto-Execution Attempts** (Short-term)

#### 2.1 Browser Bridge Execution (Reinstall Path)
**File**: `components/local-env/install-agent-modal.tsx`

**Strategy**: If browser bridge is connected, use it to execute installer

```typescript
// After saving installer, try to execute via browser bridge
if (browserBridgeConnected) {
  try {
    await executeViaBridge(installerPath);
    // Show progress
  } catch (err) {
    // Fallback to manual instructions
  }
}
```

**Action Items**:
- [ ] Check if browser bridge is connected
- [ ] If connected, attempt execution via `exec.run`
- [ ] Show real-time progress
- [ ] Handle errors gracefully

#### 2.2 Platform-Specific Auto-Execution Hints
**File**: `components/local-env/install-agent-modal.tsx`

**Windows**: Create `.bat` wrapper that can be double-clicked
**Linux/Mac**: Make installer executable, provide one-command copy-paste

**Action Items**:
- [ ] Windows: Auto-create `.bat` wrapper
- [ ] Linux/Mac: Set execute permissions via File System Access API
- [ ] Provide copy-paste command for terminal

---

### **Phase 3: Eliminate Sudo Requirement** (Medium-term)

#### 3.1 User-Level Systemd Service (Linux)
**File**: `app/api/agent/download/route.ts`

**Current**: Uses system-level systemd (`/etc/systemd/system/`)
**New**: Use user-level systemd (`~/.config/systemd/user/`)

```typescript
// Linux: Use user-level systemd service
const userServicePath = join(homedir(), '.config', 'systemd', 'user', 'op15-agent.service');
// No sudo required!
```

**Action Items**:
- [ ] Update installer to use user-level systemd
- [ ] Remove sudo requirement
- [ ] Test on Linux systems

#### 3.2 macOS Launchd (Already User-Level)
**Status**: ✅ Already uses user-level launchd (`~/Library/LaunchAgents/`)
**No changes needed**

#### 3.3 Windows Startup (Already User-Level)
**Status**: ✅ Already uses user-level startup folder
**No changes needed**

---

### **Phase 4: Progress Feedback** (Short-term)

#### 4.1 Real-Time Installation Progress
**File**: `components/local-env/install-agent-modal.tsx`

**Strategy**: Poll server for connection status, show progress steps

```typescript
const [installProgress, setInstallProgress] = useState({
  step: 'downloading', // downloading, installing, connecting, connected
  message: 'Downloading installer...',
});
```

**Action Items**:
- [ ] Add progress state to modal
- [ ] Poll `/api/users/[userId]/agent-status` every 2 seconds
- [ ] Show progress steps:
  - Downloading installer ✅
  - Installing agent ⏳
  - Starting agent ⏳
  - Connecting to server ⏳
  - Connected ✅

#### 4.2 Connection Status Polling
**File**: `components/local-env/agent-auto-installer.tsx`

**Current**: Polls every 10 seconds
**New**: Poll every 2 seconds during installation, then back to 10 seconds

**Action Items**:
- [ ] Increase polling frequency during installation
- [ ] Show connection progress in UI
- [ ] Auto-close modal when connected

---

### **Phase 5: Error Recovery** (Short-term)

#### 5.1 Retry Mechanism
**File**: `components/local-env/install-agent-modal.tsx`

**Strategy**: If installation fails, allow retry without re-downloading

**Action Items**:
- [ ] Add "Retry Installation" button
- [ ] Store installer path for retry
- [ ] Show clear error messages with recovery actions

#### 5.2 Clear Error Messages
**File**: Throughout installation flow

**Action Items**:
- [ ] Map error codes to user-friendly messages
- [ ] Provide recovery steps for each error
- [ ] Include support contact if needed

---

## Implementation Priority

### **P0 (Critical - Do First)**
1. ✅ Pre-flight Node.js detection
2. ✅ Improve error messages
3. ✅ Browser bridge execution (reinstall path)
4. ✅ Progress feedback

### **P1 (High Priority)**
5. ✅ User-level systemd service (Linux)
6. ✅ Platform-specific auto-execution hints
7. ✅ Connection status polling improvements

### **P2 (Nice to Have)**
8. ⏳ Error recovery/retry mechanism
9. ⏳ Advanced error handling

---

## Success Metrics

### **Before (Current)**
- Manual steps: 4-5 steps
- Time to connect: 2-5 minutes (with manual work)
- Success rate: ~70% (fails on Node.js check, sudo, etc.)

### **After (Target)**
- Manual steps: 2 clicks
- Time to connect: 30-60 seconds (automated)
- Success rate: ~95% (handles edge cases)

---

## Testing Checklist

### **Windows**
- [ ] Installer downloads correctly
- [ ] `.bat` wrapper created
- [ ] Double-click executes installer
- [ ] Agent starts automatically
- [ ] Connection detected within 30 seconds

### **Linux**
- [ ] Installer downloads correctly
- [ ] Installer is executable
- [ ] User-level systemd service created (no sudo)
- [ ] Agent starts automatically
- [ ] Connection detected within 30 seconds

### **macOS**
- [ ] Installer downloads correctly
- [ ] Installer is executable
- [ ] Launchd service created
- [ ] Agent starts automatically
- [ ] Connection detected within 30 seconds

### **Edge Cases**
- [ ] Node.js not installed → Clear instructions shown
- [ ] Browser bridge available → Auto-execution works
- [ ] Installation fails → Retry mechanism works
- [ ] Agent already running → Reinstall works

---

## Next Steps

1. **Start with P0 items** (pre-flight checks, error messages, progress)
2. **Test on all platforms** (Windows, Linux, macOS)
3. **Iterate based on feedback** (user testing)
4. **Move to P1 items** (user-level services, auto-execution)
5. **Polish P2 items** (error recovery, advanced handling)

---

## Notes

- **Browser Security**: We cannot bypass browser security restrictions for first install
- **Best Approach**: Make the manual step as easy as possible (one command copy-paste)
- **Future Consideration**: Native installer packages (.deb, .rpm, .pkg, .exe) for true one-click install

