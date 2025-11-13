# Railway Auto-Deploy Fix Guide

## Problem
Railway is no longer auto-deploying when you push to GitHub.

## Root Cause Analysis

Based on your git setup:
- You have **two repositories**:
  - `origin` → `https://github.com/mranderson01901234/op15.git`
  - `op15.2` → `https://github.com/mranderson01901234/op15.2.git`
- You're currently on branch `op15.2`
- Latest commit `4de8b72` is on `op15.2` branch

**Most likely issue**: Railway is watching the wrong repository (`op15` instead of `op15.2`) or wrong branch (`main` instead of `op15.2`).

## Solution Steps

### Step 1: Check Railway Service Configuration

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project
3. Go to **Settings** → **Service**
4. Check the **Source** section:
   - **Repository**: Should be `mranderson01901234/op15.2` (not `op15`)
   - **Branch**: Should be `op15.2` (not `main`)

### Step 2: Fix Repository/Branch Mismatch

If Railway is watching the wrong repo/branch:

**Option A: Update Railway to watch `op15.2` repo and branch**
1. In Railway dashboard → Settings → Service
2. Click **"Disconnect"** or **"Change Source"**
3. Reconnect to: `mranderson01901234/op15.2` repository
4. Set branch to: `op15.2`
5. Save changes

**Option B: Push to the repo/branch Railway is watching**
- If Railway is watching `op15` repo → push to `origin` remote
- If Railway is watching `main` branch → merge `op15.2` into `main` and push

### Step 3: Verify GitHub Webhook

1. Go to your GitHub repository: `https://github.com/mranderson01901234/op15.2`
2. Go to **Settings** → **Webhooks**
3. Look for a webhook pointing to Railway (usually `https://api.railway.app/webhook/...`)
4. Check if it's **Active** and has recent deliveries
5. If missing or broken:
   - Railway should recreate it automatically when you reconnect
   - Or manually add webhook: Railway dashboard → Settings → Service → "Generate Webhook URL"

### Step 4: Test Auto-Deploy

1. Make a small change (e.g., add a comment)
2. Commit and push:
   ```bash
   git add .
   git commit -m "Test Railway auto-deploy"
   git push origin op15.2
   ```
3. Check Railway dashboard → **Deployments** tab
4. Should see a new deployment triggered automatically

## Quick Diagnostic Commands

```bash
# Check which remote you're pushing to
git remote -v

# Check current branch
git branch

# Check if your branch is pushed
git log --oneline --all --graph --decorate -5

# Force trigger Railway (if webhook exists)
git commit --allow-empty -m "Trigger Railway deployment"
git push origin op15.2
```

## IMPORTANT: Your Current Setup Issue

**Problem Found**: Your `op15.2` branch is tracking `origin` (which points to `op15` repo), but Railway is likely watching the `op15.2` repository.

**Current state**:
- `origin` → `https://github.com/mranderson01901234/op15.git`
- `op15.2` remote → `https://github.com/mranderson01901234/op15.2.git`
- Your branch `op15.2` tracks `origin/op15.2` (pushes to `op15` repo)

**Solution**: You have two options:

### Option 1: Push to `op15.2` remote (Recommended if Railway watches `op15.2` repo)
```bash
# Push to the op15.2 repository instead
git push op15.2 op15.2

# Or change tracking to op15.2 remote
git branch --set-upstream-to=op15.2/op15.2 op15.2
git push
```

### Option 2: Configure Railway to watch `op15` repo
- In Railway dashboard → Settings → Service
- Change repository to `mranderson01901234/op15`
- Set branch to `op15.2`

## Common Issues

### Issue: Railway shows "No deployments"
- **Fix**: Check if service is connected to GitHub repo in Railway dashboard

### Issue: Webhook exists but not triggering
- **Fix**: Check webhook delivery logs in GitHub → Settings → Webhooks → Click webhook → Recent Deliveries
- Look for failed deliveries and error messages

### Issue: Railway is watching wrong branch
- **Fix**: Update branch in Railway dashboard → Settings → Service → Branch

### Issue: Multiple repositories causing confusion
- **Fix**: Decide which repo Railway should watch (`op15` or `op15.2`) and update Railway config accordingly

## Recommended Configuration

For your setup, Railway should be configured to:
- **Repository**: `mranderson01901234/op15.2`
- **Branch**: `op15.2`
- **Auto-deploy**: Enabled

This matches your current working branch and remote.

