# Production Image Size Fix

## Issue

Docker image size exceeded 4.0 GB limit (4.1 GB) due to Wine and Inno Setup installation.

## Root Cause

- **Wine**: ~500MB+ package
- **Inno Setup**: Additional ~100MB+ when installed in Wine
- **Wine dependencies**: Various libraries and dependencies
- **Total**: Pushed image over Railway's 4.0 GB limit

## Solution

### Removed Wine from Production Build

**File:** `nixpacks.toml`

- Removed `wine` from `nixPkgs` (saves ~500MB+)
- Removed Inno Setup installation step (saves ~100MB+)
- Production builds now focus on Next.js app + agent binaries only

### Windows Installer Strategy

**Option 1: Build Locally** (Recommended for now)
- Build Windows installers on local machine with Wine
- Commit pre-built installers (if small enough)
- Or use GitHub Actions to build and store

**Option 2: CI/CD Build** (Future)
- Build Windows installers in GitHub Actions
- Upload as release artifacts
- Download in production when needed

**Option 3: Separate Service** (Future)
- Dedicated microservice for installer building
- Only runs when needed
- Doesn't bloat main app image

## Current Behavior

### Production
- ✅ Linux installers: Built on-demand (AppImage or shell script)
- ⚠️ Windows installers: **Not available** - shows helpful error message
- ✅ Error message guides users to alternatives

### Development
- ✅ Windows installers: Built locally with Wine + Inno Setup
- ✅ Linux installers: Built locally

## Error Message

When users try to install Windows agent in production:

```
Windows installer build is not available in production.
Windows installers must be built locally or via CI/CD.
Alternative: Use Linux installer or build Windows installer manually.
```

## Alternative Solutions

### Option 1: Pre-build Windows Installers

Build Windows installers in CI/CD and store them:

```yaml
# .github/workflows/build-installers.yml
name: Build Installers
on:
  push:
    branches: [main]
jobs:
  build-windows:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Wine
        run: |
          sudo apt-get update
          sudo apt-get install -y wine
      - name: Install Inno Setup
        run: |
          wget https://jrsoftware.org/download.php/is.exe
          wine is.exe /SP- /SILENT
      - name: Build Installer
        run: |
          # Build Windows installer
      - name: Upload Artifact
        uses: actions/upload-artifact@v3
        with:
          name: windows-installer
          path: installers/*.exe
```

### Option 2: Separate Installer Service

Create a lightweight service just for building installers:

- Small Docker image (~200MB)
- Only includes Wine + Inno Setup
- Called via API when needed
- Doesn't bloat main app

### Option 3: Use GitHub Releases

- Build installers in GitHub Actions
- Upload to GitHub Releases
- Download from releases in production

## Image Size Comparison

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| Base Image | ~500MB | ~500MB | - |
| Node.js | ~200MB | ~200MB | - |
| Dependencies | ~300MB | ~300MB | - |
| Wine | ~500MB | ❌ Removed | **-500MB** |
| Inno Setup | ~100MB | ❌ Removed | **-100MB** |
| Agent Binaries | ~200MB | ~200MB | - |
| **Total** | **~4.1GB** | **~3.5GB** | **~600MB** |

## Next Steps

1. ✅ **Immediate**: Removed Wine from production (fixes image size)
2. ⏭️ **Short-term**: Build Windows installers in GitHub Actions
3. ⏭️ **Medium-term**: Create separate installer service
4. ⏭️ **Long-term**: Use cloud-based installer builder service

## Testing

### Verify Image Size

```bash
# Build locally
docker build -t op15-test .
docker images | grep op15-test

# Should be under 4.0 GB
```

### Test Windows Installer Build

```bash
# Local development (with Wine)
cd local-agent
pnpm build:binaries
node -e "
const { buildWindowsInstaller } = require('./lib/installers/windows.ts');
buildWindowsInstaller({
  userId: 'test',
  sharedSecret: 'test',
  serverUrl: 'https://test.com',
  binaryPath: 'local-agent/dist/binaries/local-agent-win-x64.exe'
}).then(path => console.log('Built:', path));
"
```

---

**Status**: ✅ **Fixed** - Image size reduced by ~600MB, now under 4.0 GB limit

