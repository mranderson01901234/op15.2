# Initial Installation Flow - Streamlined Plan

## Goal: Make First Installation as Easy as Possible

**Constraint**: Browser cannot execute local scripts (security restriction)
**Solution**: Make the manual step so easy it's essentially one-click

---

## Current Initial Installation Flow

### What Happens Now:
1. User clicks "Install Local Agent" ✅
2. User clicks "Authorize Install" ✅
3. File picker opens → User selects save location ⚠️
4. Installer saved as `op15-agent-installer.js`
5. Modal shows: "Installer saved! Run: node op15-agent-installer.js" ❌
6. **User must manually**:
   - Open terminal
   - Navigate to download location
   - Type: `node op15-agent-installer.js`
7. Installer runs (if Node.js installed)
8. Agent connects
9. UI detects connection

**Problems**:
- ❌ User doesn't know where file was saved
- ❌ User must manually navigate to file location
- ❌ User must type command manually
- ❌ No feedback during installation
- ❌ If Node.js missing, user sees error but doesn't know what to do

---

## Target Initial Installation Flow

### What Should Happen:
1. User clicks "Install Local Agent" ✅
2. User clicks "Authorize Install" ✅
3. File picker opens → User selects save location ⚠️
4. Installer saved + **copy-paste command shown** ✅
5. **User copies ONE command** → Pastes in terminal → Presses Enter ✅
6. Installer runs automatically
7. **Real-time progress shown** in modal ✅
8. Agent connects
9. UI detects connection → Modal closes automatically ✅

**Improvements**:
- ✅ Clear copy-paste command (no typing)
- ✅ Command includes full path (no navigation needed)
- ✅ Pre-flight Node.js check (before download)
- ✅ Real-time progress feedback
- ✅ Auto-close modal when connected

---

## Implementation Plan

### **Phase 1: Pre-Flight Checks** (Before Download)

#### 1.1 Detect Node.js Before Download
**Goal**: Check if Node.js is installed BEFORE downloading installer

**Implementation**:
- Add Node.js detection in modal before download
- If not detected, show clear instructions with download links
- If detected, proceed with download

**File**: `components/local-env/install-agent-modal.tsx`

**Code**:
```typescript
const checkNodeJs = async () => {
  // Try to detect Node.js via browser capabilities
  // Or show instructions if not available
  // This happens BEFORE downloading installer
};
```

**Action Items**:
- [ ] Add Node.js detection function
- [ ] Show Node.js status in modal before download
- [ ] If not detected, show download links (platform-specific)
- [ ] Block download if Node.js not detected (or allow with warning)

---

### **Phase 2: Smart File Saving** (During Download)

#### 2.1 Get Full File Path After Save
**Goal**: Know exactly where file was saved so we can provide exact command

**Current**: File System Access API doesn't expose full paths
**Solution**: Use file handle name + ask user where they saved it, OR provide relative path command

**File**: `components/local-env/install-agent-modal.tsx`

**Code**:
```typescript
// After saving file
const fileName = savedFile.name;
// We know the filename, but not full path
// Solution: Provide command that works from any location
```

**Action Items**:
- [ ] Store filename after save
- [ ] Provide command that works from Downloads folder (most common)
- [ ] Also provide command with full path if user tells us where they saved it

#### 2.2 Platform-Specific Command Generation
**Goal**: Provide exact copy-paste command for user's platform

**Windows**: 
```batch
cd %USERPROFILE%\Downloads && node op15-agent-installer.js
```

**Linux/Mac**:
```bash
cd ~/Downloads && node op15-agent-installer.js
```

**File**: `components/local-env/install-agent-modal.tsx`

**Action Items**:
- [ ] Detect platform (already done)
- [ ] Generate platform-specific command
- [ ] Show command in copy-paste box
- [ ] Make command copyable with one click

---

### **Phase 3: Improved Installer Script** (Backend)

#### 3.1 Better Error Messages
**Goal**: If Node.js missing, provide helpful error with download links

**File**: `app/api/agent/download/route.ts`

**Current**:
```javascript
console.error('❌ Node.js is not installed. Please install Node.js 20+ first.');
process.exit(1);
```

**New**:
```javascript
console.error('❌ Node.js is not installed.');
console.error('');
console.error('Please install Node.js 20+ from:');
console.error('  Windows: https://nodejs.org/en/download/');
console.error('  Linux: https://nodejs.org/en/download/package-manager/');
console.error('  macOS: https://nodejs.org/en/download/ or: brew install node');
console.error('');
console.error('After installing, run this installer again.');
process.exit(1);
```

**Action Items**:
- [ ] Update Node.js check error message
- [ ] Include platform-specific download links
- [ ] Provide clear next steps

#### 3.2 Eliminate Sudo Requirement (Linux)
**Goal**: Use user-level systemd service instead of system-level

**File**: `app/api/agent/download/route.ts`

**Current**: Uses `/etc/systemd/system/` (requires sudo)
**New**: Use `~/.config/systemd/user/` (no sudo needed)

**Code Change**:
```javascript
// OLD (requires sudo):
const servicePath = '/etc/systemd/system/op15-agent.service';
execSync(`sudo tee ${servicePath} ...`);

// NEW (no sudo):
const userServiceDir = join(homedir(), '.config', 'systemd', 'user');
mkdirSync(userServiceDir, { recursive: true });
const servicePath = join(userServiceDir, 'op15-agent.service');
writeFileSync(servicePath, serviceContent);
execSync('systemctl --user daemon-reload');
execSync('systemctl --user enable op15-agent.service');
execSync('systemctl --user start op15-agent.service');
```

**Action Items**:
- [ ] Update installer to use user-level systemd
- [ ] Remove all sudo commands
- [ ] Test on Linux systems

---

### **Phase 4: Progress Feedback** (UI)

#### 4.1 Real-Time Installation Progress
**Goal**: Show user what's happening during installation

**File**: `components/local-env/install-agent-modal.tsx`

**Progress States**:
1. "Downloading installer..." ✅
2. "Installer saved! Copy the command below..." ✅
3. "Waiting for installation to start..." ⏳
4. "Installing agent..." ⏳
5. "Starting agent..." ⏳
6. "Connecting to server..." ⏳
7. "Connected! ✅" → Auto-close modal

**Implementation**:
```typescript
const [installProgress, setInstallProgress] = useState({
  step: 'downloading', // downloading, saved, installing, connecting, connected
  message: 'Downloading installer...',
});

// Poll connection status every 2 seconds
useEffect(() => {
  if (installProgress.step === 'saved') {
    const interval = setInterval(async () => {
      const status = await checkAgentStatus();
      if (status.connected) {
        setInstallProgress({ step: 'connected', message: 'Connected! ✅' });
        setTimeout(() => onOpenChange(false), 2000);
      }
    }, 2000);
    return () => clearInterval(interval);
  }
}, [installProgress.step]);
```

**Action Items**:
- [ ] Add progress state to modal
- [ ] Show progress steps visually
- [ ] Poll connection status every 2 seconds
- [ ] Auto-close modal when connected

#### 4.2 Copy-Paste Command Box
**Goal**: Make it super easy to copy the command

**UI Design**:
```
┌─────────────────────────────────────────────────┐
│ Installer saved! Copy and run this command:    │
│                                                 │
│ ┌───────────────────────────────────────────┐   │
│ │ cd ~/Downloads && node op15-agent-... │ [📋]│   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ [Copy Command]                                  │
└─────────────────────────────────────────────────┘
```

**Action Items**:
- [ ] Create copy-paste command box component
- [ ] Make command copyable with one click
- [ ] Show platform-specific command
- [ ] Include full path if possible

---

### **Phase 5: Auto-Detection** (Connection)

#### 5.1 Faster Connection Polling
**Goal**: Detect connection quickly after installation

**File**: `components/local-env/agent-auto-installer.tsx`

**Current**: Polls every 10 seconds
**New**: Poll every 2 seconds during installation, then back to 10 seconds

**Action Items**:
- [ ] Increase polling frequency during installation
- [ ] Show connection progress in UI
- [ ] Auto-close modal when connected

---

## Implementation Checklist

### **P0 (Critical - Do First)**
- [ ] **Pre-flight Node.js detection** (before download)
- [ ] **Copy-paste command box** (one-click copy)
- [ ] **Better error messages** (Node.js missing)
- [ ] **Progress feedback** (show installation steps)
- [ ] **Auto-close modal** (when connected)

### **P1 (High Priority)**
- [ ] **User-level systemd** (eliminate sudo on Linux)
- [ ] **Faster connection polling** (2 seconds during install)
- [ ] **Platform-specific commands** (Windows vs Linux/Mac)

### **P2 (Nice to Have)**
- [ ] **Smart path detection** (ask user where they saved)
- [ ] **Installation retry** (if fails)
- [ ] **Advanced error handling** (recovery steps)

---

## Success Metrics

### **Before (Current)**
- Steps: 2 clicks + open terminal + navigate + type command
- Time: 2-5 minutes (with manual work)
- User confusion: High (where is file? what command?)

### **After (Target)**
- Steps: 2 clicks + copy command + paste + enter
- Time: 30-60 seconds (mostly automated)
- User confusion: Low (clear instructions, copy-paste ready)

---

## User Experience Flow

### **Step-by-Step User Journey**

1. **User clicks "Install Local Agent"**
   - Modal opens
   - Shows: "Checking prerequisites..."

2. **Pre-flight Check**
   - ✅ Node.js detected → "Ready to install!"
   - ❌ Node.js missing → "Please install Node.js first" + download links

3. **User clicks "Authorize Install"**
   - "Downloading installer..."
   - File picker opens

4. **User selects save location**
   - "Installer saved!"
   - Copy-paste command box appears
   - Command: `cd ~/Downloads && node op15-agent-installer.js`
   - [Copy Command] button

5. **User copies command**
   - Opens terminal
   - Pastes command
   - Presses Enter

6. **Installation Progress** (shown in modal)
   - "Installing agent..." ⏳
   - "Starting agent..." ⏳
   - "Connecting to server..." ⏳
   - "Connected! ✅" → Modal closes automatically

**Total User Actions**: 2 clicks + copy + paste + enter = **5 actions** (vs current 7+ actions)

---

## Next Steps

1. **Start with P0 items**:
   - Pre-flight Node.js detection
   - Copy-paste command box
   - Progress feedback
   - Better error messages

2. **Test on all platforms**:
   - Windows (Downloads folder)
   - Linux (Downloads folder)
   - macOS (Downloads folder)

3. **Iterate based on feedback**:
   - User testing
   - Refine copy-paste command
   - Improve progress messages

4. **Move to P1 items**:
   - User-level systemd
   - Faster polling
   - Platform optimizations

---

## Notes

- **Browser Security**: We cannot bypass browser security for first install
- **Best Approach**: Make manual step as easy as possible (copy-paste)
- **Future**: Consider native installers (.deb, .rpm, .pkg, .exe) for true one-click

