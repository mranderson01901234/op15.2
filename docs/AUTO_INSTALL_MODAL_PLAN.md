# Auto-Install Modal: Behind-the-Scenes Installation

## Goal
- ✅ All UI in web app modal
- ✅ Download installer automatically
- ✅ Auto-install behind the scenes
- ✅ Show progress in modal
- ✅ Zero user interaction after clicking "Install"

## Challenge
Browsers cannot execute local files directly (security restriction). However, we can use platform-specific workarounds.

---

## Solution: Hybrid Approach

### Phase 1: Download + Auto-Execute Attempt

1. **User clicks "Install Agent" in modal**
2. **Modal shows "Downloading installer..."**
3. **Download installer automatically** (using File System Access API or blob download)
4. **Try to auto-execute installer** using platform-specific methods
5. **Show progress in modal** (polling connection status)
6. **Auto-close modal when connected**

### Platform-Specific Auto-Execution

#### Windows:
- Download `.exe` installer
- Use `msiexec` or silent installer flags
- OR use Windows protocol handler (`op15-installer://`)
- OR use browser extension with native messaging

#### macOS:
- Download `.pkg` installer
- Use `open` command via File System Access API
- OR use `installer` command with silent flags
- OR use browser extension with native messaging

#### Linux:
- Download `.deb` package
- Use `xdg-open` to trigger package manager
- OR use `dpkg` command directly (if we can get file path)
- OR use browser extension with native messaging

---

## Implementation Strategy

### Option A: File System Access API + Auto-Execute (Best UX)

**How it works**:
1. Use File System Access API to save installer
2. Get file handle
3. Try to execute using platform-specific methods
4. Fallback to manual execution if auto-execute fails

**Limitations**:
- File System Access API doesn't expose full file paths
- Can't directly execute files from browser
- Need workaround for each platform

### Option B: Browser Extension with Native Messaging (Most Reliable)

**How it works**:
1. User installs browser extension (one-time)
2. Extension handles auto-installation
3. Web app communicates with extension
4. Extension executes installer silently

**Pros**:
- ✅ Can auto-execute installers
- ✅ Works reliably across platforms
- ✅ Can show progress

**Cons**:
- ⚠️ Requires extension installation (one-time setup)

### Option C: Silent Installer Flags (Windows/Mac)

**How it works**:
1. Download installer with silent flags
2. Use platform-specific execution methods
3. Installer runs silently in background

**Windows Example**:
```javascript
// Download installer.exe
// Try to execute: msiexec /i installer.exe /quiet /norestart
```

**macOS Example**:
```javascript
// Download installer.pkg
// Try to execute: installer -pkg installer.pkg -target /
```

**Limitations**:
- Still requires some way to trigger execution
- May need elevated permissions

---

## Recommended Implementation: Progressive Enhancement

### Step 1: Download Installer
- Use File System Access API to save installer
- Show "Downloading..." in modal

### Step 2: Attempt Auto-Execute
- Try platform-specific execution methods
- Show "Installing..." in modal

### Step 3: Fallback to Manual
- If auto-execute fails, show instructions
- But make it as easy as possible (one double-click)

### Step 4: Progress Tracking
- Poll connection status every 2 seconds
- Show progress: "Downloading..." → "Installing..." → "Connecting..." → "Connected!"
- Auto-close modal when connected

---

## Code Implementation

### Updated Modal Component

```typescript
const handleAutoInstall = async () => {
  setIsInstalling(true);
  setInstallStep("Downloading installer...");
  
  try {
    // 1. Download installer
    const installerBlob = await downloadInstaller(platform, userId);
    setInstallStep("Saving installer...");
    
    // 2. Save using File System Access API
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: getInstallerName(platform),
      types: [getInstallerMimeType(platform)],
    });
    
    const writable = await fileHandle.createWritable();
    await writable.write(installerBlob);
    await writable.close();
    
    setInstallStep("Installing agent...");
    
    // 3. Try to auto-execute
    const executed = await tryAutoExecute(fileHandle, platform);
    
    if (executed) {
      setInstallStep("Installation in progress...");
      // Poll for connection
      await pollForConnection(userId);
      setInstallStep("Connected! ✅");
      onInstallComplete();
    } else {
      // Fallback: Show manual instructions
      setInstallStep("Please double-click the installer to complete installation");
    }
  } catch (error) {
    setError("Installation failed. Please try again.");
  }
};
```

### Platform-Specific Auto-Execute

```typescript
async function tryAutoExecute(fileHandle: FileSystemFileHandle, platform: string): Promise<boolean> {
  try {
    const file = await fileHandle.getFile();
    
    if (platform === 'win32') {
      // Windows: Try to execute via protocol handler or extension
      return await executeWindowsInstaller(file);
    } else if (platform === 'darwin') {
      // macOS: Try to open installer
      return await executeMacInstaller(file);
    } else {
      // Linux: Try to execute via xdg-open
      return await executeLinuxInstaller(file);
    }
  } catch (error) {
    console.error('Auto-execute failed:', error);
    return false;
  }
}
```

---

## Browser Extension Approach (Most Reliable)

### Extension Architecture

1. **Extension installed once** (from Chrome Web Store)
2. **Extension registers native messaging host**
3. **Web app communicates with extension**
4. **Extension handles installer execution**

### Web App → Extension Communication

```typescript
// In web app modal
const handleAutoInstall = async () => {
  // Check if extension is installed
  if (await checkExtensionInstalled()) {
    // Send message to extension
    chrome.runtime.sendMessage({
      type: 'INSTALL_AGENT',
      platform: platform,
      userId: userId,
      serverUrl: serverUrl,
    });
    
    // Extension handles download + install
    // Web app polls for connection
    await pollForConnection(userId);
  } else {
    // Fallback: Show extension install prompt
    showExtensionInstallPrompt();
  }
};
```

### Extension Native Messaging

```javascript
// Extension background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INSTALL_AGENT') {
    // Download installer
    // Execute installer silently
    // Start agent
    // Report back to web app
  }
});
```

---

## Implementation Priority

### Phase 1: Download + Progress Modal (Immediate)
- ✅ Download installer automatically
- ✅ Show progress in modal
- ✅ Poll for connection
- ⚠️ Manual execution (user double-clicks)

### Phase 2: Auto-Execute Attempts (Short-term)
- ✅ Try platform-specific execution methods
- ✅ Fallback to manual if fails
- ⚠️ May not work on all platforms

### Phase 3: Browser Extension (Long-term)
- ✅ Most reliable auto-execution
- ✅ Works across all platforms
- ⚠️ Requires extension installation

---

## User Experience Flow

### Ideal Flow (with Extension):
1. User clicks "Install Agent" → Modal opens
2. Modal shows "Downloading installer..." → Auto-downloads
3. Modal shows "Installing agent..." → Extension auto-installs
4. Modal shows "Connecting..." → Agent connects
5. Modal shows "Connected! ✅" → Auto-closes
6. **Total**: 1 click, zero manual steps

### Fallback Flow (without Extension):
1. User clicks "Install Agent" → Modal opens
2. Modal shows "Downloading installer..." → Auto-downloads
3. Modal shows "Installer ready! Double-click to install"
4. User double-clicks installer → Auto-installs
5. Modal shows "Connecting..." → Agent connects
6. Modal shows "Connected! ✅" → Auto-closes
7. **Total**: 2 clicks (install button + double-click installer)

---

## Next Steps

1. **Implement download + progress modal** (Phase 1)
2. **Add auto-execute attempts** (Phase 2)
3. **Create browser extension** (Phase 3)

Should I start with Phase 1 (download + progress modal)?

