# Windows Installer Production Fix

## Issue

Windows installer build fails in production with "Installer build failed" error.

## Root Cause

Production environment (Railway) doesn't have:
1. **Wine** - Required to run Windows tools on Linux
2. **Inno Setup** - Required to build Windows `.exe` installers

## Solution

### 1. Added Wine to Production

**File:** `nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs_20", "wine"]
```

Wine is now installed during Railway deployment.

### 2. Auto-Install Inno Setup

**File:** `nixpacks.toml` (build phase)

Added build step to automatically install Inno Setup in Wine:
- Downloads Inno Setup installer
- Installs silently via Wine
- Makes ISCC.exe available for builder

### 3. Improved Error Messages

**File:** `app/api/agent/download/route.ts`

- More specific error messages based on failure type
- Shows details and hints to users
- Better debugging information

**File:** `components/local-env/install-agent-modal-simple.tsx`

- Displays detailed error messages in UI
- Shows hints and details from server

## Deployment Process

When Railway deploys, it will:

1. Install Wine (via nixpacks)
2. Build Next.js app
3. Build agent binaries
4. **Install Inno Setup in Wine** (new)
5. Start server

## Verification

After deployment, check logs for:
- ✅ `Wine not available` or `Wine not functional` - Wine status
- ✅ `Installing Inno Setup in Wine...` - Inno Setup installation
- ✅ `Inno Setup already installed` - Already configured

## Troubleshooting

### Wine Not Working

**Error**: `Wine not functional`

**Solution**: Check Railway build logs for Wine errors. May need to configure Wine environment.

### Inno Setup Installation Failed

**Error**: `Inno Setup installation attempted` (but not found)

**Solution**: 
- Check `/tmp/inno-setup-install.log` in build logs
- May need manual installation or different approach
- Consider pre-installing Inno Setup in Docker image

### ISCC.exe Not Found

**Error**: `Inno Setup compiler (ISCC.exe) not found`

**Solution**:
- Verify Inno Setup installed: `ls ~/.wine/drive_c/Program\ Files\ \(x86\)/Inno\ Setup\ 6/ISCC.exe`
- Set `INNO_SETUP_PATH` environment variable if needed
- Check Wine prefix location

## Alternative Solutions

If automatic installation doesn't work:

### Option 1: Pre-install in Docker Image

Create custom Dockerfile with Wine + Inno Setup pre-installed.

### Option 2: Use GitHub Actions

Build Windows installer in GitHub Actions CI/CD, upload as artifact, download in production.

### Option 3: Pre-built Installers

Build installers locally, commit to repo (not recommended - large files).

## Testing

### Local Testing

```bash
# Test Wine + Inno Setup
wine --version
ls ~/.wine/drive_c/Program\ Files\ \(x86\)/Inno\ Setup\ 6/ISCC.exe

# Test installer build
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

### Production Testing

1. Deploy to Railway
2. Check build logs for Wine/Inno Setup installation
3. Click "Install Agent" in web UI
4. Should download `.exe` installer

---

**Status**: ✅ Fixed - Wine added to production, Inno Setup auto-installs during build

