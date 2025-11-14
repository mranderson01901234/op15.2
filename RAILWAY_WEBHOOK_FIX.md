# Railway Webhook Not Triggering - Fix Guide

## Problem
Railway 15.3 is connected to GitHub but not picking up new commits/pushes.

## Quick Fixes

### Fix 1: Reconnect GitHub Connection (Most Common Fix)

1. Go to Railway Dashboard → Railway 15.3 → **Settings** → **Service**
2. Click **"Disconnect"** (or **"Change Source"**)
3. Click **"Connect GitHub"** again
4. Select the same repository: `mranderson01901234/op15.2`
5. Select branch: `op15.2`
6. Enable **Auto Deploy** ✅
7. Click **"Save"** or **"Connect"**

This will recreate the webhook and fix most connection issues.

### Fix 2: Check GitHub Webhook Status

1. Go to GitHub: https://github.com/mranderson01901234/op15.2/settings/hooks
2. Look for a webhook with URL: `https://api.railway.app/webhook/...`
3. Check:
   - ✅ Status: **Active** (green checkmark)
   - ✅ Recent deliveries: Should show recent successful deliveries
   - ✅ Events: Should include "Push" events

**If webhook is missing or shows errors:**
- Go back to Railway → Settings → Service → Click **"Reconnect"** or **"Disconnect and Reconnect"**
- Railway will automatically recreate the webhook

### Fix 3: Verify Repository and Branch Match

In Railway Dashboard → Settings → Service:

**Check:**
- **Repository**: Should be `mranderson01901234/op15.2` (exact match)
- **Branch**: Should be `op15.2` (exact match, case-sensitive)
- **Auto Deploy**: Should be **Enabled** ✅

**If wrong:**
- Update to match your git setup
- Save changes
- Railway will update the webhook

### Fix 4: Manual Deployment Trigger

While fixing webhook, trigger manual deployment:

1. Railway Dashboard → Railway 15.3
2. Click **"Deploy"** button (or go to **Deployments** tab)
3. Click **"New Deployment"** or **"Redeploy"**
4. Select branch: `op15.2`
5. Click **"Deploy"**

This will deploy immediately without waiting for webhook.

### Fix 5: Check Webhook Delivery Logs

1. GitHub → Repository → **Settings** → **Webhooks**
2. Click on the Railway webhook
3. Scroll to **"Recent Deliveries"**
4. Check the latest delivery:
   - ✅ Green = Success
   - ❌ Red = Failed (click to see error details)

**Common webhook errors:**
- `404 Not Found` = Railway service deleted or URL changed → Reconnect
- `401 Unauthorized` = Railway token expired → Reconnect
- `Timeout` = Railway service down → Check Railway status

### Fix 6: Force Webhook Update

If webhook exists but isn't working:

1. Railway Dashboard → Settings → Service
2. Look for **"Webhook URL"** or **"Regenerate Webhook"** option
3. Click to regenerate
4. Copy the new webhook URL
5. GitHub → Settings → Webhooks → Edit Railway webhook
6. Update the URL with the new one
7. Save

## Testing After Fix

After applying fixes, test with:

```bash
git commit --allow-empty -m "Test Railway webhook"
git push op15.2 op15.2
```

Then check Railway Dashboard → **Deployments** within 1-2 minutes.

## Current Git Setup

**Your current setup:**
- Branch: `op15.2`
- Remote: `op15.2` → `https://github.com/mranderson01901234/op15.2.git`
- Latest commit: Just pushed test commit

**Railway should watch:**
- Repository: `mranderson01901234/op15.2`
- Branch: `op15.2`

## Step-by-Step Reconnection Process

1. **Railway Dashboard** → Railway 15.3 → **Settings** → **Service**
2. Note current repository/branch (for reference)
3. Click **"Disconnect"** or **"Change Source"**
4. Confirm disconnection
5. Click **"Connect GitHub"**
6. Authorize Railway (if prompted)
7. Select repository: `mranderson01901234/op15.2`
8. Select branch: `op15.2`
9. ✅ Check **"Auto Deploy"**
10. Click **"Save"** or **"Connect"**
11. Wait for webhook creation (should be instant)
12. Verify in GitHub → Settings → Webhooks (should see new Railway webhook)

## Verification Checklist

After reconnecting, verify:

- [ ] Railway Dashboard shows correct repository: `mranderson01901234/op15.2`
- [ ] Railway Dashboard shows correct branch: `op15.2`
- [ ] Auto Deploy is enabled
- [ ] GitHub webhook exists and is active
- [ ] Test commit triggers deployment (check within 2 minutes)

## If Still Not Working

1. **Check Railway Status**: https://status.railway.app
2. **Check GitHub Status**: https://www.githubstatus.com
3. **Try Different Branch**: Temporarily switch Railway to `main` branch to test
4. **Contact Support**: Railway Dashboard → Help → Support

## Alternative: Use Railway CLI

If webhook continues to fail, you can trigger deployments via CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

But webhook is preferred for automatic deployments.

