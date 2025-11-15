# Railway Deployment Trigger Guide

## Issue: Railway Not Auto-Deploying

If Railway didn't pick up your changes, try these solutions:

## Solution 1: Manual Redeploy (Fastest)

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project/service
3. Click **"Deployments"** tab
4. Click **"Redeploy"** button (or three dots → Redeploy)
5. Select the latest commit: `18efd42` or `Streamline local environment installation...`

## Solution 2: Check Railway Configuration

1. Go to Railway Dashboard → Your Service → **Settings**
2. Check **Source** section:
   - **Repository**: Should be `mranderson01901234/op15`
   - **Branch**: Should be `main` (or whatever branch Railway is watching)
3. If wrong, update it and save

## Solution 3: Verify Webhook

1. Go to GitHub: `https://github.com/mranderson01901234/op15`
2. Go to **Settings** → **Webhooks**
3. Look for Railway webhook (usually `https://api.railway.app/webhook/...`)
4. Check if it's **Active** and has recent deliveries
5. If broken, Railway will recreate it when you reconnect the service

## Solution 4: Trigger with Empty Commit

Already done! An empty commit was pushed to trigger deployment:
```bash
git commit --allow-empty -m "Trigger Railway deployment"
git push origin main
```

## Solution 5: Check Railway Logs

1. Go to Railway Dashboard → Your Service → **Logs**
2. Look for deployment errors
3. Check if build is failing
4. Look for environment variable issues

## Common Issues

### Issue: Railway Watching Wrong Branch
- **Fix**: Update branch in Railway Settings → Source → Branch

### Issue: Webhook Not Firing
- **Fix**: Disconnect and reconnect GitHub repo in Railway
- Railway will recreate the webhook automatically

### Issue: Build Failing
- **Fix**: Check Railway logs for errors
- Verify `NEXT_PUBLIC_APP_URL` is set correctly
- Ensure all required env vars are set

## Current Status

- ✅ Changes pushed to `origin/main` (commit `18efd42`)
- ✅ Empty commit pushed to trigger deployment
- ⏳ Waiting for Railway to pick up changes

## Next Steps

1. **Check Railway Dashboard** → Deployments tab
2. **Look for new deployment** triggered by commit `18efd42`
3. **If no deployment appears**, manually redeploy from Railway dashboard
4. **If deployment fails**, check logs for errors

## Quick Check Commands

```bash
# Verify commit is pushed
git log origin/main --oneline -3

# Check if Railway webhook exists (in GitHub)
# Go to: https://github.com/mranderson01901234/op15/settings/hooks
```

## Railway Environment Variables

Make sure these are set in Railway:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL` (should be your Railway domain)

