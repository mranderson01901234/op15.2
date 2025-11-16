# Architecture Audit - Quick Reference

## Critical Questions - Direct Answers

### ✅ What is our current installation method?
**Answer:** Shell script installers (Unix) / Batch file in .exe wrapper (Windows) with embedded pre-built binaries.

**Details:**
- User clicks "Install Agent" → Downloads installer script
- Unix: Must run `chmod +x installer.sh && ./installer.sh` (terminal required)
- Windows: Double-click `.exe` (works!)
- Installer extracts binary, writes config.json, registers OS service, starts agent

### ✅ Does it require Node.js on user machine?
**Answer:** **NO** - Binary is self-contained with embedded Node.js runtime (via pkg).

**Details:**
- Uses `pkg` to create static binary with Node.js 18 embedded
- Binary size: 37-50MB per platform
- Zero external dependencies required
- User doesn't need Node.js installed

### ✅ Is it 2-click install or more complex?
**Answer:** **More complex** - Windows works (2 clicks), Unix requires terminal commands (3+ clicks).

**Current Flow:**
1. Click "Install Agent" button (1 click)
2. Download installer (automatic)
3. **Windows:** Double-click installer (1 click) = **2 clicks total** ✅
4. **Unix:** Run `chmod +x installer.sh && ./installer.sh` (terminal) = **3+ clicks** ❌

**Blueprint Goal:** True 2-click (double-click installer) on all platforms.

### ✅ Should we continue current path or pivot to blueprint?
**Answer:** **Hybrid Approach** - Keep binary system, upgrade installers to OS-native format.

**Reasoning:**
- ✅ Binary system works perfectly (matches blueprint)
- ❌ Installer format needs upgrade (scripts → OS-native installers)
- ⚠️ Incremental improvement is safer than full pivot

---

## Architecture Summary

### Current State
```
Installation: Shell script installers (Unix) / .exe wrapper (Windows)
Agent: Pre-built static binary (pkg, 37-50MB, self-contained)
Runtime: Embedded Node.js 18 (no external Node.js required)
Communication: WebSocket (primary) + HTTP API (fallback)
Auto-start: ✅ systemd/launchd/Windows service
CI/CD: ❌ Manual builds
```

### Blueprint Target
```
Installation: OS-native installers (.exe/.pkg/.deb)
Agent: Pre-built static binary (pkg, ~45-50MB, self-contained)
Runtime: Embedded Node.js (no external Node.js required)
Communication: HTTP API (primary) + WebSocket (optional)
Auto-start: ✅ systemd/launchd/Windows service
CI/CD: ✅ Automated builds
```

### Gap Analysis
| Component | Status | Gap |
|-----------|--------|-----|
| Binary System | ✅ Match | None |
| Installer Format | ❌ Mismatch | Scripts vs. OS-native |
| Installation UX | ⚠️ Partial | Unix requires terminal |
| CI/CD | ❌ Missing | Manual vs. automated |
| Communication | ⚠️ Partial | WebSocket priority vs. HTTP |

---

## File Locations

### Key Files
- **Download Endpoint:** `app/api/agent/download/route.ts`
- **Agent Code:** `local-agent/index.ts`
- **Build Config:** `local-agent/package.json`
- **UI Component:** `components/local-env/install-agent-modal-simple.tsx`
- **Server:** `server.js` (custom Next.js server with WebSocket)

### Binary Locations
- **Pre-built Binaries:** `local-agent/dist/binaries/` (175MB total)
- **Pre-built Installers:** `installers/` (141MB total)

---

## Next Steps (Prioritized)

### Week 1: CI/CD Pipeline
- [ ] Create `.github/workflows/build-agent.yml`
- [ ] Automate binary builds
- [ ] Store binaries in GitHub Releases
- **Effort:** 1-2 days

### Week 2: Windows Installer Upgrade
- [ ] Use Inno Setup or NSIS
- [ ] Create true `.exe` installer
- [ ] Test double-click installation
- **Effort:** 2-3 days

### Week 3-4: macOS Installer Upgrade
- [ ] Use `pkgbuild` + `productbuild`
- [ ] Create `.pkg` installer
- [ ] Code signing (if Apple Developer account)
- **Effort:** 3-4 days

### Week 5-6: Linux Installer Upgrade
- [ ] Use AppImage (universal) or `.deb` package
- [ ] Test double-click installation
- **Effort:** 2-3 days

---

## Decision: Hybrid Approach

**Keep:**
- ✅ Binary system (pkg-based, works well)
- ✅ Auto-start mechanism (systemd/launchd/Windows service)
- ✅ Communication protocols (WebSocket + HTTP both work)

**Upgrade:**
- ⚠️ Installer format (scripts → OS-native installers)
- ⚠️ CI/CD automation (manual → automated)

**Timeline:** 4-6 weeks to full blueprint compliance

---

**See `ARCHITECTURE_AUDIT_REPORT.md` for full details.**

