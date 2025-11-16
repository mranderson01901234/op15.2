# Phase 1 Preparation & Implementation Plan

**Date:** 2024  
**Goal:** Eliminate all dev toolchain requirements. Pre-built binaries + OS-native installers. Zero terminal commands.

---

## Current State Analysis

### ✅ What's Already in Place

1. **Agent Code Structure**
   - `local-agent/index.ts` - Single entry point ✅
   - HTTP server on port 4001 ✅
   - All required endpoints (`/status`, `/execute`, `/fs/*`, etc.) ✅
   - Missing: `/health` endpoint (needed for Task 1.3)

2. **Installer Infrastructure**
   - `app/api/agent/download/route.ts` - Download endpoint exists ✅
   - Currently serves from `installers/` directory (pre-built binaries may exist) ✅
   - Missing: CI/CD to build and update these binaries

3. **UI Components**
   - `components/local-env/agent-auto-installer.tsx` - Installer UI ✅
   - `components/local-env/agent-connection-guide.tsx` - Shows terminal commands ❌ (needs update)
   - Missing: Auto-detect on page load (Task 1.3)

### ❌ What Needs to Be Fixed

1. **No CI/CD Pipeline**
   - No `.github/workflows/` directory
   - No automated binary builds
   - Binaries in `installers/` may be outdated

2. **Legacy Dev Installers**
   - `installer-src/installer.js` - Requires Node/pnpm on user machine ❌
   - `installer-src/installer-server.js` - Dev-only script ❌
   - These MUST be removed per Phase 1 requirements

3. **Missing `/health` Endpoint**
   - Agent only has `/status` (slow, ~2s timeout)
   - Need fast `/health` endpoint (<200ms) for Task 1.3

4. **UI Shows Terminal Commands**
   - `agent-connection-guide.tsx` shows `cd local-agent && pnpm build && node dist/index.js` ❌
   - Must be replaced with "Install Agent" button only

---

## Phase 1 Task Breakdown

### Task 1.1: Build OS-specific Agent Binaries in CI/CD

**Goal:** Create pre-built static binaries for all platforms (no Node/pnpm required on user machine)

**Sub-tasks:**

1. **Add `pkg` bundling to `local-agent`**
   - Install `pkg` as dev dependency
   - Add build script: `pkg . --targets node20-linux-x64,node20-macos-x64,node20-macos-arm64,node20-win-x64`
   - Output binaries to `local-agent/dist/binaries/`

2. **Create CI/CD Workflow**
   - File: `.github/workflows/build-agent.yml`
   - Triggers: On push to main, manual workflow_dispatch
   - Steps:
     - Checkout code
     - Setup Node.js 20
     - Install pnpm
     - Build TypeScript (`pnpm build` in `local-agent`)
     - Run `pkg` for each target OS/arch
     - Upload binaries as artifacts
     - Optionally: Upload to GitHub Releases

3. **Update `/api/agent/download` Route**
   - Serve pre-built binaries from CI artifacts (or `installers/` directory)
   - Generate OS-native installer wrapper that:
     - Copies binary to `~/.op15-agent/op15-agent` (or platform-specific path)
     - Writes `config.json` with `serverUrl`, `userId`, `sharedSecret` (random 128-bit token)
     - Registers OS-level service (systemd user / LaunchAgent / Windows service)
     - Starts service immediately

**Files to Modify:**
- `local-agent/package.json` - Add `pkg` and build scripts
- `.github/workflows/build-agent.yml` - NEW FILE
- `app/api/agent/download/route.ts` - Update to serve binaries + generate installers

**Expected Result:**
- Users download pre-built binaries (not source code)
- Installers just drop binary + config + service file
- No Node, no pnpm, no build on user machines
- Click → Download → Run installer → Done

---

### Task 1.2: Remove Legacy Dev Installer Scripts

**Goal:** Remove all references to Node/pnpm/CLI commands from UI and codebase

**Sub-tasks:**

1. **Delete Legacy Installer Scripts**
   - Delete `installer-src/installer.js` (requires Node/pnpm on user machine)
   - Delete `installer-src/installer-server.js` (dev-only)
   - Delete `installer-src/package.json` (if only used by legacy installers)
   - Keep `installer-src/` directory empty or remove entirely

2. **Update `agent-connection-guide.tsx`**
   - Remove all terminal command displays
   - Remove `cd local-agent && pnpm build && node dist/index.js` references
   - Show "Install Agent" button instead (link to `AgentAutoInstaller`)
   - Only show when `connectionStatus === "none"`

**Files to Modify:**
- `components/local-env/agent-connection-guide.tsx` - Remove CLI commands
- Delete: `installer-src/installer.js`
- Delete: `installer-src/installer-server.js`

**Expected Result:**
- No references to Node/pnpm/CLI in UI
- Users only see "Install Agent" button
- No terminal commands displayed anywhere

---

### Task 1.3: Auto-detect Running Agent on Page Load

**Goal:** Check `/health` endpoint directly on mount to detect running agent faster

**Sub-tasks:**

1. **Add `/health` Endpoint to Agent**
   - File: `local-agent/index.ts`
   - Add route: `GET /health`
   - Return: `{ status: 'ok', timestamp: Date.now() }`
   - Fast response (<200ms), no heavy operations

2. **Update `agent-auto-installer.tsx`**
   - On mount, check `http://127.0.0.1:4001/health` directly (200ms timeout)
   - If healthy → Check if registered via `/api/users/${userId}/agent-status`
   - If registered → Set `isConnected = true`
   - If not registered → Attempt registration
   - If unhealthy → Show install button

**Files to Modify:**
- `local-agent/index.ts` - Add `/health` endpoint
- `components/local-env/agent-auto-installer.tsx` - Add direct health check on mount

**Expected Result:**
- Faster connection detection (no polling needed initially)
- Agent detected immediately if already running
- Better UX (no delay before showing connection status)

---

## Implementation Order

1. **First:** Task 1.3 (Add `/health` endpoint) - Quick win, enables better UX
2. **Second:** Task 1.2 (Remove legacy scripts) - Clean up codebase
3. **Third:** Task 1.1 (CI/CD + Binaries) - Most complex, requires CI setup

---

## Success Criteria

After Phase 1 completion:

- ✅ Pre-built binaries available for all platforms (Linux x64, macOS x64/ARM64, Windows x64)
- ✅ Installer copies binary + config + service (no builds)
- ✅ No manual terminal commands required
- ✅ No Node/pnpm required on user machine
- ✅ Legacy dev installer scripts removed
- ✅ UI shows no CLI commands
- ✅ `/health` endpoint exists and responds <200ms
- ✅ Auto-detection works on page load

---

## Risk Assessment

**Task 1.1 (CI/CD + Binaries):** Medium Risk
- Requires CI/CD setup (GitHub Actions)
- Requires `pkg` bundling tool (may have edge cases)
- Need to test binaries on each platform
- **Mitigation:** Test locally first, then add CI

**Task 1.2 (Remove Legacy Scripts):** Low Risk
- Simple deletion and UI updates
- Easy to verify (grep for "pnpm build", "node dist/index.js")

**Task 1.3 (Auto-detect):** Low Risk
- Simple endpoint addition
- Straightforward UI update
- Easy to test locally

---

## Testing Plan

### Local Testing (Before CI/CD)

1. **Test `/health` Endpoint**
   ```bash
   cd local-agent
   pnpm build
   node dist/index.js http://localhost:3000 test_user
   # In another terminal:
   curl http://127.0.0.1:4001/health
   # Should return: {"status":"ok","timestamp":1234567890}
   ```

2. **Test Binary Build Locally**
   ```bash
   cd local-agent
   pnpm add -D pkg
   pnpm pkg . --targets node20-linux-x64
   # Test binary:
   ./dist/binaries/op15-agent-linux http://localhost:3000 test_user
   ```

3. **Test Installer Generation**
   - Update `/api/agent/download` to generate installer wrapper
   - Download installer via browser
   - Run installer and verify:
     - Binary copied to `~/.op15-agent/op15-agent`
     - `config.json` written correctly
     - Service registered (systemd/launchd/Windows)
     - Agent starts automatically

### CI/CD Testing

1. **Test Workflow Triggers**
   - Push to main → Should build binaries
   - Manual workflow_dispatch → Should build binaries

2. **Test Binary Artifacts**
   - Download artifacts from CI run
   - Test each binary on respective platform
   - Verify binaries are standalone (no Node.js required)

---

## Next Steps

1. ✅ Review REPO_SPECIFIC_ARCHITECTURE.md
2. ✅ Create Phase 1 preparation document (this file)
3. ⏭️ Start Task 1.3 (Add `/health` endpoint) - Quick win
4. ⏭️ Start Task 1.2 (Remove legacy scripts) - Clean up
5. ⏭️ Start Task 1.1 (CI/CD + Binaries) - Main work

---

## Notes

- **Priority:** Phase 1 is CRITICAL - removes all dev toolchain requirements
- **Non-negotiable:** No Node/pnpm/CLI commands on user machines after Phase 1
- **Timeline:** Target 1 week for Phase 1 completion
- **Dependencies:** None - Phase 1 is independent of Phase 2/3


