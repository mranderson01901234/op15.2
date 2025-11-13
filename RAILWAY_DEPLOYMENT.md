# Railway Deployment Guide

## Overview
This guide covers deploying the op15 application to Railway.

## Prerequisites
- Railway account (sign up at https://railway.app)
- GitHub repository connected to Railway
- Required API keys (Clerk, Gemini)

## Railway Configuration

### 1. Environment Variables

Set these environment variables in Railway dashboard (Settings → Variables):

#### Required Variables:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your Clerk publishable key
- `CLERK_SECRET_KEY` - Your Clerk secret key  
- `GEMINI_API_KEY` - Your Google Gemini API key

#### Optional Variables:
- `NEXT_PUBLIC_APP_URL` - Your Railway app URL (e.g., `https://your-app.up.railway.app`)
  - If not set, the app will use `RAILWAY_PUBLIC_DOMAIN` automatically
- `BRAVE_API_KEY` - For Brave Search integration (optional)
- `WORKSPACE_ROOT` - Workspace root directory (optional)

### 2. Railway Auto-Detection

Railway will automatically:
- Detect Next.js project
- Use `pnpm` (specified in `package.json`)
- Run `pnpm build` during build
- Run `pnpm start` to start the server

### 3. Port Configuration

Railway automatically sets the `PORT` environment variable. The `server.js` file reads this:
```javascript
const port = parseInt(process.env.PORT || '3000', 10);
```

### 4. Public Domain

Railway provides `RAILWAY_PUBLIC_DOMAIN` automatically. The app uses this for WebSocket connections if `NEXT_PUBLIC_APP_URL` is not set.

## Deployment Steps

1. **Connect Repository**
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **Set Environment Variables**
   - Go to your service → Variables
   - Add all required variables listed above

3. **Configure Build Settings** (if needed)
   - Railway auto-detects Next.js
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Start command: `pnpm start`

4. **Deploy**
   - Railway will automatically deploy on push to main branch
   - Or trigger manual deployment from dashboard

## Troubleshooting

### Issue: "Cannot connect WebSocket" errors
**Solution**: Set `NEXT_PUBLIC_APP_URL` to your Railway domain:
```
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
```

### Issue: Build fails
**Solution**: 
- Ensure `packageManager` is set to `pnpm@10.20.0` in `package.json`
- Check Railway logs for specific errors
- Verify all environment variables are set

### Issue: Authentication not working
**Solution**:
- Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set
- Check Clerk dashboard for correct keys
- Ensure Clerk app URL matches Railway domain

## Railway-Specific Features

### Automatic HTTPS
Railway provides HTTPS automatically. No SSL configuration needed.

### Environment Variables
Railway provides these automatically:
- `PORT` - Server port
- `RAILWAY_PUBLIC_DOMAIN` - Public domain (e.g., `your-app.up.railway.app`)
- `RAILWAY_ENVIRONMENT` - Environment name

### Logs
Access logs from Railway dashboard → Service → Logs

## Notes

- Railway uses `railway.json` for custom configuration (optional)
- The app uses `server.js` for custom server with WebSocket support
- WebSocket connections work automatically with Railway's HTTPS

## Important: Railway vs GitHub Actions Permissions

**Railway does NOT have an "unrestricted" option** like GitHub Actions. Railway works differently:

- **Environment Variables**: All variables you set in Railway dashboard are automatically available to your app
- **No Permission Settings**: Railway doesn't have workflow permission settings - your app has full access to environment variables you configure
- **Networking**: Railway provides public networking by default (no "unrestricted" toggle needed)

If you're looking for environment variable access:
1. Go to Railway dashboard → Your Service → Variables
2. Add variables there - they're automatically available to your app
3. No additional permission settings needed

If you're experiencing issues with environment variables:
- Check that variables are set in Railway dashboard (Settings → Variables)
- Verify variable names match exactly (case-sensitive)
- Redeploy after adding new variables

