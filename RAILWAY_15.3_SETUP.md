# Railway 15.3 Setup Guide

## Quick Setup Steps

### 1. Connect Railway 15.3 to GitHub

1. Go to [Railway Dashboard](https://railway.app)
2. Select your **Railway 15.3** project/service
3. Go to **Settings** → **Service**
4. Click **"Connect GitHub"** (or **"Change Source"** if already connected)

### 2. Configure Repository and Branch

**Select:**
- **Repository**: `mranderson01901234/op15.2` (or `mranderson01901234/op15` - whichever you prefer)
- **Branch**: `op15.2` (or `main` - match what you want to deploy)
- **Auto Deploy**: ✅ **Enable** (check the box)

**Recommended Configuration:**
- Repository: `mranderson01901234/op15.2`
- Branch: `op15.2`
- Auto Deploy: Enabled

### 3. Set Environment Variables

Go to Railway Dashboard → Railway 15.3 → **Variables**

**Required Variables:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
CLERK_SECRET_KEY=sk_test_... (or sk_live_...)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Optional but Recommended:**
```
NEXT_PUBLIC_APP_URL=https://your-railway-15-3-domain.up.railway.app
BRAVE_API_KEY=your_brave_api_key (if using search)
WORKSPACE_ROOT=/app (optional)
```

**Note:** After setting `NEXT_PUBLIC_APP_URL`, Railway will provide your domain. Update this variable with the actual domain Railway assigns.

### 4. Verify Build Configuration

Railway should auto-detect Next.js, but verify:

**Build Command:** (auto-detected)
```
pnpm install --frozen-lockfile && pnpm build
```

**Start Command:** (from `railway.json`)
```
NODE_ENV=production node server.js
```

**Port:** Railway automatically sets `PORT` - no need to configure

### 5. Trigger First Deployment

After connecting:

1. Railway should automatically start deploying
2. Or manually trigger: Click **"Deploy"** → Select branch `op15.2` → **"Deploy"**
3. Watch the **Deployments** tab for build progress

### 6. Get Your Domain

After deployment succeeds:

1. Go to Railway Dashboard → Railway 15.3 → **Settings** → **Networking**
2. Click **"Generate Domain"** (if not already generated)
3. Copy your domain (e.g., `railway-15-3-production.up.railway.app`)
4. Update `NEXT_PUBLIC_APP_URL` variable with this domain:
   ```
   NEXT_PUBLIC_APP_URL=https://railway-15-3-production.up.railway.app
   ```
5. Redeploy after updating the variable

## Current Git Setup

**Available Repositories:**
- `origin` → `https://github.com/mranderson01901234/op15.git`
- `op15.2` → `https://github.com/mranderson01901234/op15.2.git`

**Current Branch:** `op15.2`

**Latest Commit:** `9069891` - "Trigger Railway deployment - test auto-deploy"

## Troubleshooting

### Railway Not Deploying?

1. **Check Repository/Branch:**
   - Settings → Service → Verify repository and branch match your git setup

2. **Check Webhook:**
   - GitHub → Repository Settings → Webhooks
   - Look for Railway webhook (should be active)

3. **Check Build Logs:**
   - Railway Dashboard → Deployments → Click latest deployment → View logs

4. **Manual Deploy:**
   - Railway Dashboard → Click **"Deploy"** → Select branch → Deploy

### Build Failing?

**Common Issues:**
- Missing `pnpm` - Railway should auto-detect from `package.json`
- Missing environment variables - Check Variables tab
- Port issues - Railway handles this automatically

**Check `nixpacks.toml`:**
- Should have `pnpm@10.20.0` specified
- Build command should run `pnpm build`

### App Returns 500 Error?

**Check:**
1. Runtime logs in Railway Dashboard
2. Environment variables are set correctly
3. `NEXT_PUBLIC_APP_URL` matches your Railway domain
4. Clerk keys are valid

## Files Used by Railway

- `railway.json` - Railway configuration (start command, restart policy)
- `nixpacks.toml` - Build configuration (pnpm version, build steps)
- `package.json` - Dependencies and scripts
- `server.js` - Custom Next.js server with WebSocket support

## Next Steps After Setup

1. ✅ Connect Railway 15.3 to GitHub repository
2. ✅ Set environment variables
3. ✅ Trigger first deployment
4. ✅ Get Railway domain and update `NEXT_PUBLIC_APP_URL`
5. ✅ Test the deployed application
6. ✅ Verify WebSocket connections work (if using local env bridge)

## Support

If issues persist:
- Check Railway logs: Dashboard → Deployments → Latest → Logs
- Check GitHub webhook: Repository → Settings → Webhooks
- Verify git remotes: `git remote -v`
- Verify branch: `git branch -a`

