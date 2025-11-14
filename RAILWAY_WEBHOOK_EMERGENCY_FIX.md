# Railway Webhook Emergency Fix - Step by Step

## Problem
Railway is connected to GitHub but NOT deploying when you push commits.

## IMMEDIATE FIX - Do This Now

### Step 1: Disconnect and Reconnect Railway (CRITICAL)

1. **Go to Railway Dashboard**: https://railway.app
2. **Select Railway 15.3** project/service
3. **Go to Settings** → **Service**
4. **Click "Disconnect"** (or "Change Source" if available)
5. **Confirm disconnection**
6. **Wait 5 seconds**
7. **Click "Connect GitHub"** again
8. **Select repository**: `mranderson01901234/op15.2`
9. **Select branch**: `op15.2`
10. **✅ CHECK "Auto Deploy"** (make sure it's enabled!)
11. **Click "Save" or "Connect"**

**This recreates the webhook and fixes 90% of issues.**

### Step 2: Verify Webhook in GitHub

1. **Go to GitHub**: https://github.com/mranderson01901234/op15.2/settings/hooks
2. **Look for Railway webhook** (URL should contain `api.railway.app`)
3. **Check status**: Should be **Active** (green checkmark)
4. **Click on the webhook** to see details
5. **Check "Recent Deliveries"** tab:
   - Should show recent push events
   - Green = Success
   - Red = Failed (click to see error)

**If webhook is missing or shows errors:**
- Go back to Railway → Settings → Service → Click "Reconnect"
- Railway will recreate it

### Step 3: Test with Manual Deployment

**While fixing webhook, trigger manual deployment:**

1. Railway Dashboard → Railway 15.3
2. Click **"Deploy"** button (or go to **Deployments** tab)
3. Click **"New Deployment"** or **"Redeploy"**
4. Select branch: `op15.2`
5. Click **"Deploy"**

This deploys immediately without waiting for webhook.

### Step 4: Force Trigger Webhook (After Reconnecting)

After reconnecting, test the webhook:

```bash
# Create an empty commit to trigger webhook
git commit --allow-empty -m "Test Railway webhook after reconnect"
git push op15.2 op15.2
```

Then check Railway Dashboard → **Deployments** within 1-2 minutes.

## Common Issues and Fixes

### Issue 1: Webhook URL Changed
**Symptom**: GitHub webhook shows 404 errors
**Fix**: Reconnect Railway (Step 1 above)

### Issue 2: Auto Deploy Disabled
**Symptom**: Webhook works but no deployments triggered
**Fix**: Railway Settings → Service → Enable **Auto Deploy** ✅

### Issue 3: Wrong Branch Watched
**Symptom**: Railway watching `main` but you push to `op15.2`
**Fix**: Railway Settings → Service → Change branch to `op15.2`

### Issue 4: Wrong Repository
**Symptom**: Railway watching `op15` but you push to `op15.2`
**Fix**: Railway Settings → Service → Change repository to `mranderson01901234/op15.2`

### Issue 5: GitHub Webhook Permissions
**Symptom**: Webhook exists but shows permission errors
**Fix**: 
- GitHub → Repository → Settings → Webhooks
- Click Railway webhook
- Check "Just the push event" is selected
- Save

### Issue 6: Railway Service Deleted/Recreated
**Symptom**: Old webhook points to non-existent service
**Fix**: Delete old webhook in GitHub, reconnect in Railway

## Verification Checklist

After reconnecting, verify:

- [ ] Railway Dashboard shows: Repository `mranderson01901234/op15.2`
- [ ] Railway Dashboard shows: Branch `op15.2`
- [ ] Railway Dashboard shows: **Auto Deploy: Enabled** ✅
- [ ] GitHub webhook exists and is **Active**
- [ ] GitHub webhook shows recent successful deliveries
- [ ] Test commit triggers deployment (check within 2 minutes)

## Nuclear Option: Complete Reset

If nothing works:

1. **Railway Dashboard** → Railway 15.3 → Settings → Service
2. **Disconnect** GitHub completely
3. **Wait 30 seconds**
4. **Delete webhook in GitHub** (if it still exists):
   - GitHub → Settings → Webhooks → Delete Railway webhook
5. **Railway Dashboard** → Connect GitHub again
6. **Authorize Railway** (if prompted)
7. **Select**: `mranderson01901234/op15.2` repository
8. **Select**: `op15.2` branch
9. **Enable**: Auto Deploy ✅
10. **Save**

## Alternative: Use Railway CLI

If webhook continues to fail, use CLI for deployments:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Deploy current branch
railway up
```

But webhook is preferred for automatic deployments.

## Current Git Setup

**Your setup:**
- Repository: `mranderson01901234/op15.2`
- Branch: `op15.2`
- Remote: `op15.2` → `https://github.com/mranderson01901234/op15.2.git`

**Railway should watch:**
- Repository: `mranderson01901234/op15.2`
- Branch: `op15.2`
- Auto Deploy: Enabled ✅

## Still Not Working?

1. **Check Railway Status**: https://status.railway.app
2. **Check GitHub Status**: https://www.githubstatus.com
3. **Check Railway Logs**: Dashboard → Deployments → Latest → Logs
4. **Contact Railway Support**: Dashboard → Help → Support

## Quick Test Command

After reconnecting, run this to test:

```bash
git commit --allow-empty -m "Test Railway webhook $(date +%s)"
git push op15.2 op15.2
```

Then watch Railway Dashboard → Deployments (should see new deployment within 1-2 minutes).

