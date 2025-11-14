# Railway 15.0 Not Picking Up Commits - Troubleshooting Guide

## Current Status
- ✅ Latest commit `df191cd` ("list files fixed") is on `origin/main`
- ✅ Repository: `mranderson01901234/op15`
- ✅ Branch: `main`
- ❌ Railway 15.0 is not detecting new commits

## Quick Fixes

### Fix 1: Verify Railway 15.0 Configuration (MOST IMPORTANT)

1. Go to [Railway Dashboard](https://railway.app)
2. Select **Railway 15.0** project/service
3. Go to **Settings** → **Service**
4. Verify these settings:

**Required Configuration:**
- **Repository**: Should be `mranderson01901234/op15` (NOT `op15.2`)
- **Branch**: Should be `main` (NOT `op15.2`)
- **Auto Deploy**: Should be **Enabled** ✅

**If these are wrong:**
1. Click **"Disconnect"** or **"Change Source"**
2. Click **"Connect GitHub"** again
3. Select repository: `mranderson01901234/op15`
4. Select branch: `main`
5. ✅ Enable **Auto Deploy**
6. Click **"Save"** or **"Connect"**

### Fix 2: Check GitHub Webhook for Railway 15.0

1. Go to GitHub: https://github.com/mranderson01901234/op15/settings/hooks
2. Look for Railway webhook(s)
3. Check each webhook:
   - ✅ URL contains `api.railway.app/webhook/...`
   - ✅ Status: **Active** (green checkmark)
   - ✅ Recent deliveries: Should show recent successful deliveries
   - ✅ Events: Should include "Push" events

**If webhook is missing or shows errors:**
- Go to Railway Dashboard → Railway 15.0 → Settings → Service
- Click **"Reconnect"** or **"Disconnect and Reconnect"**
- Railway will automatically recreate the webhook

### Fix 3: Manual Deployment Trigger

While fixing webhook, trigger manual deployment:

1. Railway Dashboard → **Railway 15.0**
2. Click **"Deploy"** button (or go to **Deployments** tab)
3. Click **"New Deployment"** or **"Redeploy"**
4. Select branch: `main`
5. Select commit: `df191cd` (or latest)
6. Click **"Deploy"**

This will deploy immediately without waiting for webhook.

### Fix 4: Check Webhook Delivery Logs

1. GitHub → Repository → **Settings** → **Webhooks**
2. Click on the Railway 15.0 webhook
3. Scroll to **"Recent Deliveries"**
4. Check the latest delivery:
   - ✅ Green = Success (webhook is working)
   - ❌ Red = Failed (click to see error details)

**Common webhook errors:**
- `404 Not Found` = Railway service deleted or URL changed → Reconnect
- `401 Unauthorized` = Railway token expired → Reconnect
- `Timeout` = Railway service down → Check Railway status

### Fix 5: Force Reconnect (Recommended)

If webhook isn't working, force reconnect:

1. **Railway Dashboard** → Railway 15.0 → **Settings** → **Service**
2. Note current repository/branch (for reference)
3. Click **"Disconnect"** or **"Change Source"**
4. Confirm disconnection
5. Click **"Connect GitHub"**
6. Authorize Railway (if prompted)
7. Select repository: `mranderson01901234/op15`
8. Select branch: `main`
9. ✅ Check **"Auto Deploy"**
10. Click **"Save"** or **"Connect"**
11. Wait for webhook creation (should be instant)
12. Verify in GitHub → Settings → Webhooks (should see Railway webhook)

### Fix 6: Test After Fix

After reconnecting, test with:

```bash
git checkout main
git commit --allow-empty -m "Test Railway 15.0 webhook"
git push origin main
```

Then check Railway Dashboard → Railway 15.0 → **Deployments** within 1-2 minutes.

## Verification Checklist

After fixing, verify:

- [ ] Railway Dashboard shows correct repository: `mranderson01901234/op15`
- [ ] Railway Dashboard shows correct branch: `main`
- [ ] Auto Deploy is enabled ✅
- [ ] GitHub webhook exists and is active
- [ ] Latest commit `df191cd` is visible in Railway
- [ ] Test commit triggers deployment (check within 2 minutes)

## Current Git Setup

**Repository Configuration:**
- `origin` → `https://github.com/mranderson01901234/op15.git`
- Branch: `main`
- Latest commit: `df191cd` - "list files fixed: app/api/chat/route.ts, app/page.tsx, lib/llm/system-prompt.ts"

**Railway 15.0 should watch:**
- Repository: `mranderson01901234/op15`
- Branch: `main`

## Common Issues

### Issue: "Railway shows old commit"
- **Fix**: Check that Railway is connected to `mranderson01901234/op15` repository, not `op15.2`
- **Fix**: Verify branch is `main`, not `op15.2`

### Issue: "No deployments showing"
- **Fix**: Service might not be connected to GitHub. Reconnect in Settings → Service.

### Issue: "Webhook not triggering"
- **Fix**: Check GitHub webhook settings and Railway connection.
- **Fix**: Reconnect Railway to GitHub to regenerate webhook.

### Issue: "Build failing"
- **Fix**: Check build logs in Railway Dashboard → Deployments → Latest → Logs
- **Fix**: Verify environment variables are set correctly

## Alternative: Use Railway CLI

If webhook continues to fail, you can trigger deployments via CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project (select Railway 15.0)
railway link

# Deploy
railway up
```

But webhook is preferred for automatic deployments.

## Support

If issues persist:
- Check Railway Status: https://status.railway.app
- Check GitHub Status: https://www.githubstatus.com
- Contact Railway Support: Railway Dashboard → Help → Support

