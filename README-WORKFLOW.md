# Git Workflow - Keep Branches Synced

## 🚀 Quick Start

After making commits, run:

```bash
pnpm sync
```

Or directly:

```bash
./scripts/sync-branches.sh
```

This automatically:
- ✅ Pushes `op15.2` to both repositories
- ✅ Merges `op15.2` into `main` branch
- ✅ Keeps everything synced

## 📋 Standard Workflow

### 1. Make your changes
```bash
# Work on op15.2 branch (already set up)
git add .
git commit -m "Your commit message"
```

### 2. Sync everything
```bash
pnpm sync
```

That's it! The script handles:
- Pushing to both remotes
- Merging into main
- Keeping branches in sync

## 🔧 Setup (One-time)

Branch tracking is already configured. You can verify:

```bash
git branch -vv
```

Should show: `op15.2 [op15.2/op15.2]`

## 📝 What the Script Does

1. **Fetches latest** from all remotes
2. **Pushes op15.2** to both `op15.2` and `origin` remotes
3. **Checks if main needs updates** (compares commits)
4. **Merges op15.2 into main** if needed
5. **Pushes merged main** branch
6. **Cleans up** temporary branches

## 🎯 Current Configuration

- **Working branch**: `op15.2`
- **Primary remote**: `op15.2` → `mranderson01901234/op15.2`
- **Secondary remote**: `origin` → `mranderson01901234/op15`
- **Main branch**: `op15.2/main`

## 💡 Tips

### Push without syncing
```bash
git push                    # Pushes to op15.2/op15.2 (tracked)
git push origin op15.2      # Also push to origin
```

### Check what needs syncing
```bash
git log op15.2/main..op15.2/op15.2 --oneline
```

### Manual merge (if script fails)
```bash
git checkout -b temp-merge op15.2/main
git merge op15.2/op15.2 -m "Merge op15.2 into main"
git push op15.2 temp-merge:main
git checkout op15.2
git branch -D temp-merge
```

## ⚠️ Troubleshooting

### Script fails: "uncommitted changes"
```bash
git stash
pnpm sync
git stash pop
```

### Script fails: merge conflicts
Resolve conflicts manually in the temp branch, then continue.

### Want to see script output?
The script shows detailed progress. Check what it's doing step by step.

## 📚 Files

- `scripts/sync-branches.sh` - The sync script
- `.gitconfig-workflow.md` - Detailed workflow guide
- `README-WORKFLOW.md` - This file

## ✅ Best Practices

1. **Always work on `op15.2` branch**
2. **Run `pnpm sync` after committing**
3. **Pull before starting new work**: `git pull op15.2 op15.2`
4. **Check status**: `git status` before syncing

