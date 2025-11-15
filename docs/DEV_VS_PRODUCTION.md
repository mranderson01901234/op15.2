# Development vs Production (Railway) Differences

## Overview

This document explains why the development environment and Railway deployment may have different functionality and how to align them.

## Key Differences

### 1. **Next.js Mode**

**Development:**
- Uses `next({ dev: true })` - enables hot reloading, detailed error pages, source maps
- Unoptimized builds for faster iteration
- Full error stack traces

**Production (Railway):**
- Uses `next({ dev: false })` - optimized production builds
- Minified code, tree-shaking, code splitting
- Generic error pages for security

**Impact:** Some features may behave differently due to optimizations.

### 2. **WebSocket Support**

**Development:**
- Custom `server.js` handles WebSocket connections directly
- WebSocket server runs on same port as HTTP server
- Full control over WebSocket upgrade handling

**Production (Railway):**
- Railway may have networking restrictions
- WebSocket connections might be blocked or require special configuration
- Load balancers may not support WebSocket upgrades

**Check:** Verify Railway allows WebSocket connections on port 3000.

### 3. **Environment Variables**

**Development:**
- Uses `.env.local` file
- All variables available immediately

**Production (Railway):**
- Must be set in Railway dashboard
- Common missing variables:
  - `NEXT_PUBLIC_APP_URL` - Should be your Railway URL
  - `GEMINI_API_KEY` - Required for chat
  - `CLERK_SECRET_KEY` - Required for auth
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Required for auth
  - `BRAVE_API_KEY` - Optional, for web search

**Action:** Verify all environment variables are set in Railway dashboard.

### 4. **File System Access**

**Development:**
- Has direct access to local filesystem
- Can read/write files in workspace root
- Can execute shell commands

**Production (Railway):**
- Ephemeral filesystem (resets on deploy)
- Limited filesystem access
- Cannot access user's local files (requires browser bridge)

**Impact:** File operations work differently - Railway uses browser bridge for local file access.

### 5. **Server URL Detection**

**Development:**
- Uses `localhost:3000` or `NEXT_PUBLIC_APP_URL`

**Production (Railway):**
- Priority order:
  1. `NEXT_PUBLIC_APP_URL`
  2. `RAILWAY_PUBLIC_DOMAIN` (auto-provided by Railway)
  3. Request headers

**Action:** Set `NEXT_PUBLIC_APP_URL` in Railway to your Railway domain.

### 6. **Debug Logging**

**Development:**
- Debug logs enabled (`NODE_ENV !== 'production'`)
- Full console output

**Production:**
- Debug logs disabled
- Only info/warn/error logs shown

**Impact:** Less visibility into what's happening in production.

### 7. **Build Process**

**Development:**
- No build step - runs directly from source
- TypeScript compiled on-the-fly

**Production:**
- Runs `next build` - full TypeScript compilation
- Optimized bundles
- May catch errors that dev mode doesn't

**Impact:** Production builds may fail if there are TypeScript errors.

## Common Issues & Solutions

### Issue 1: WebSocket Not Working

**Symptom:** Local environment bridge doesn't connect on Railway.

**Solution:**
1. Verify Railway allows WebSocket connections
2. Check Railway networking settings
3. Ensure `server.js` is being used (not `next start`)
4. Verify `railway.json` has correct start command

### Issue 2: Environment Variables Missing

**Symptom:** Features don't work, API calls fail.

**Solution:**
1. Check Railway dashboard → Variables tab
2. Ensure all required variables are set:
   ```
   NEXT_PUBLIC_APP_URL=https://your-app.railway.app
   GEMINI_API_KEY=your-key
   CLERK_SECRET_KEY=your-key
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-key
   ```
3. Redeploy after adding variables

### Issue 3: Different Behavior

**Symptom:** Feature works in dev but not production.

**Solution:**
1. Check browser console for errors
2. Check Railway logs: `railway logs`
3. Verify environment variables match
4. Check if feature depends on dev mode behavior

### Issue 4: Build Errors

**Symptom:** Railway build fails but dev works.

**Solution:**
1. Run `pnpm build` locally to catch errors
2. Check TypeScript errors: `pnpm type-check`
3. Ensure all dependencies are in `dependencies` not `devDependencies`

## Alignment Checklist

- [ ] All environment variables set in Railway
- [ ] `NEXT_PUBLIC_APP_URL` points to Railway domain
- [ ] WebSocket connections allowed in Railway
- [ ] `railway.json` has correct start command
- [ ] Build passes locally: `pnpm build`
- [ ] TypeScript checks pass: `pnpm type-check`
- [ ] No dev-only code paths (check for `NODE_ENV === 'development'`)

## Railway Configuration

### railway.json
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "NODE_ENV=production node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Required Environment Variables
```
NEXT_PUBLIC_APP_URL=https://your-app.railway.app
GEMINI_API_KEY=your-gemini-key
CLERK_SECRET_KEY=your-clerk-secret
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
BRAVE_API_KEY=your-brave-key (optional)
```

## Debugging Production Issues

1. **Check Railway Logs:**
   ```bash
   railway logs
   ```

2. **Check Browser Console:**
   - Open DevTools → Console
   - Look for errors or warnings

3. **Verify Environment:**
   - Add temporary logging to check env vars
   - Check Railway dashboard → Variables

4. **Test Locally in Production Mode:**
   ```bash
   pnpm build
   NODE_ENV=production pnpm start
   ```

## Next Steps

If you're experiencing specific functionality differences:

1. Identify which feature is different
2. Check if it depends on:
   - WebSocket connections
   - File system access
   - Environment variables
   - Dev mode behavior
3. Check Railway logs for errors
4. Compare environment variables between dev and Railway

