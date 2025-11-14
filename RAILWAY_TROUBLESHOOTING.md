# Railway Deployment Troubleshooting

## Current Status
- ✅ Latest commit pushed to `op15.2` branch in `op15.2` repository
- ✅ Commit hash: `9069891` - "Trigger Railway deployment - test auto-deploy"
- ✅ Repository: `mranderson01901234/op15.2`
- ✅ Branch: `op15.2`

## Steps to Fix Railway Not Picking Up Commits

### 1. Verify Railway Service Configuration

Go to [Railway Dashboard](https://railway.app) → Your Project → Your Service → **Settings** → **Service**

Check these settings:

**Source Configuration:**
- **Repository**: Should be `mranderson01901234/op15.2` (NOT `op15`)
- **Branch**: Should be `op15.2` (NOT `main`)
- **Auto Deploy**: Should be **Enabled** ✅

**If these are wrong:**
1. Click **"Disconnect"** or **"Change Source"**
2. Reconnect to GitHub
3. Select repository: `mranderson01901234/op15.2`
4. Select branch: `op15.2`
5. Enable **Auto Deploy**
6. Save changes

### 2. Check GitHub Webhook

Go to GitHub: https://github.com/mranderson01901234/op15.2/settings/hooks

**Look for:**
- Webhook URL: `https://api.railway.app/webhook/...`
- Status: Should be **Active** ✅
- Recent deliveries: Should show recent successful deliveries

**If webhook is missing or broken:**
1. Go to Railway Dashboard → Settings → Service
2. Look for **"Generate Webhook URL"** or **"Reconnect GitHub"**
3. Follow the prompts to reconnect
4. Railway will automatically create/update the webhook

### 3. Manual Deployment Trigger

If auto-deploy isn't working, trigger manually:

1. Go to Railway Dashboard → Your Service
2. Click **"Deploy"** or **"Redeploy"** button
3. Select the latest commit or branch `op15.2`
4. Click **"Deploy"**

### 4. Check Railway Logs

Go to Railway Dashboard → Your Service → **Deployments** tab

**Look for:**
- Recent deployment attempts
- Build logs (check for errors)
- Runtime logs (check for startup errors)

**Common issues in logs:**
- Missing environment variables
- Build failures
- Port configuration issues

### 5. Verify Environment Variables

Go to Railway Dashboard → Your Service → **Variables**

**Required variables:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (if using authentication)
- `CLERK_SECRET_KEY` (if using authentication)
- `GEMINI_API_KEY` (for chat functionality)
- `NEXT_PUBLIC_APP_URL` (optional, but recommended - set to your Railway domain)

**Optional variables:**
- `BRAVE_API_KEY` (for search)
- `WORKSPACE_ROOT` (for filesystem operations)

### 6. Check Build Configuration

Railway should auto-detect Next.js, but verify:

**Build Command:** (should auto-detect)
```
pnpm install --frozen-lockfile && pnpm build
```

**Start Command:** (from `railway.json`)
```
NODE_ENV=production node server.js
```

**Port:** Railway automatically sets `PORT` environment variable

### 7. Force Reconnect (Last Resort)

If nothing works:

1. Railway Dashboard → Settings → Service
2. Click **"Disconnect"**
3. Click **"Connect GitHub"**
4. Select repository: `mranderson01901234/op15.2`
5. Select branch: `op15.2`
6. Enable **Auto Deploy**
7. Save

This will recreate the webhook and connection.

## Quick Test

After fixing configuration, test with:

```bash
git commit --allow-empty -m "Test Railway auto-deploy"
git push op15.2 op15.2
```

Then check Railway Dashboard → Deployments within 1-2 minutes.

## Common Issues

### Issue: "No deployments showing"
- **Fix**: Service might not be connected to GitHub. Reconnect in Settings.

### Issue: "Build failing"
- **Fix**: Check build logs for missing dependencies or build errors.

### Issue: "Deployment succeeds but app returns 500"
- **Fix**: Check runtime logs and environment variables.

### Issue: "Webhook not triggering"
- **Fix**: Check GitHub webhook settings and Railway connection.

## Current Git Setup

Your current setup:
- **Local branch**: `op15.2`
- **Tracking**: `op15.2/op15.2` (pushes to `op15.2` repository)
- **Remote**: `https://github.com/mranderson01901234/op15.2.git`

This is correct if Railway is watching `op15.2` repository and `op15.2` branch.

