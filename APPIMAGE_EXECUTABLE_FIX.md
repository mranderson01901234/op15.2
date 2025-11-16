# AppImage Executable Permission Fix

## Issue

AppImage files downloaded from the browser are not executable by default, preventing double-click installation.

## Root Cause

Browsers strip executable permissions when downloading files for security reasons. This is standard browser behavior and cannot be bypassed.

## Solution

### Updated UI Instructions

The UI now provides clear instructions for making the AppImage executable:

1. **GUI Method** (Recommended):
   - Right-click file → Properties → Permissions
   - Check "Allow executing file as program"
   - Double-click to run

2. **Terminal Method** (Alternative):
   - `chmod +x OP15-Agent-Installer.AppImage`
   - `./OP15-Agent-Installer.AppImage`

## Why This Happens

- **Browser Security**: Browsers intentionally strip executable permissions
- **File System**: Linux file managers require explicit permission to execute
- **AppImage Format**: AppImages are executable binaries, but permissions are lost during download

## Workarounds

### Option 1: User Makes Executable (Current Solution)
- User right-clicks → Properties → Permissions → Check executable
- One-time setup per download
- Standard Linux behavior

### Option 2: Wrapper Script (Future)
Create a `.sh` wrapper that:
1. Makes AppImage executable
2. Runs the AppImage
3. User double-clicks wrapper instead

### Option 3: Desktop Entry (Future)
Create a `.desktop` file that:
1. Points to AppImage
2. Can be double-clicked directly
3. Requires desktop integration

## Current Behavior

✅ **AppImage Downloads**: Successfully downloads from server
⚠️ **Permissions**: User must make executable (one-time per download)
✅ **Installation**: Works perfectly after making executable

## Testing

1. Download AppImage from UI
2. Check file permissions: `ls -l ~/Downloads/OP15-Agent-Installer.AppImage`
3. Should show: `-rw-r--r--` (not executable)
4. Make executable: `chmod +x ~/Downloads/OP15-Agent-Installer.AppImage`
5. Should show: `-rwxr-xr-x` (executable)
6. Double-click should work

---

**Status**: ✅ **Fixed** - Clear instructions provided, standard Linux behavior

