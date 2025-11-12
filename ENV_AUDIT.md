# Environment Variables Audit

This document provides a comprehensive audit of all environment variables used throughout the application.

## Summary

- **Total Environment Variables Found**: 12
- **Required Variables**: 3
- **Optional Variables**: 9
- **Environment Files**: `.env.local` (not tracked in git)

## Required Environment Variables

These variables must be set for the application to function properly.

### 1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- **Type**: String (required)
- **Purpose**: Clerk authentication publishable key for client-side authentication
- **Used In**: 
  - `lib/utils/clerk-env.ts`
  - `app/layout.tsx`
- **Validation**: Validated via Zod schema in `clerk-env.ts`
- **Where to Get**: [Clerk Dashboard](https://dashboard.clerk.com)
- **Notes**: Must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser

### 2. `CLERK_SECRET_KEY`
- **Type**: String (required)
- **Purpose**: Clerk authentication secret key for server-side authentication
- **Used In**: 
  - `lib/utils/clerk-env.ts`
  - `app/layout.tsx`
- **Validation**: Validated via Zod schema in `clerk-env.ts`
- **Where to Get**: [Clerk Dashboard](https://dashboard.clerk.com)
- **Notes**: Server-side only, never exposed to client

### 3. `GEMINI_API_KEY`
- **Type**: String (required for chat features)
- **Purpose**: Google Gemini API key for LLM chat functionality
- **Used In**: 
  - `lib/utils/env.ts` (getChatEnv - required)
  - `lib/utils/env.ts` (getEnv - optional)
  - `lib/tools/imagen.ts`
  - `app/api/imagen/generate/route.ts`
- **Validation**: Required in `chatEnvSchema`, optional in `envSchema`
- **Where to Get**: [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Notes**: Required for chat operations, optional for filesystem operations

## Optional Environment Variables

### 4. `WORKSPACE_ROOT`
- **Type**: String (optional)
- **Purpose**: Root directory for workspace filesystem operations
- **Default**: `process.cwd()` or `/` (fallback)
- **Used In**: 
  - `lib/utils/env.ts`
  - `app/api/filesystem/root/route.ts`
  - `vitest.config.ts` (uses `HOME` as fallback)
- **Notes**: Used for filesystem operations when browser bridge is not connected

### 5. `BRAVE_API_KEY`
- **Type**: String (optional)
- **Purpose**: Brave Search API key for web search functionality
- **Used In**: 
  - `lib/utils/env.ts`
- **Notes**: Enables Brave search tool functionality

### 6. `BROWSER_SERVICE_URL`
- **Type**: String (optional)
- **Purpose**: URL for the browser automation service
- **Default**: `http://localhost:7071`
- **Used In**: 
  - `app/api/browser/sessions/route.ts`
  - `app/api/browser/sessions/[sid]/route.ts`
  - `app/api/browser/capture/route.ts`
  - `app/api/browser/input/route.ts`
  - `app/api/browser/navigate/route.ts`
  - `app/api/browser/read/route.ts`
- **Notes**: Server-side only, used for browser automation API routes

### 7. `NEXT_PUBLIC_BROWSER_SERVICE_URL`
- **Type**: String (optional)
- **Purpose**: Public URL for browser service (client-side)
- **Used In**: 
  - `components/browser/BrowserPanel.tsx`
- **Notes**: Must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser

### 8. `NEXT_PUBLIC_APP_URL`
- **Type**: String (optional)
- **Purpose**: Public application URL for local environment bridge connections
- **Default**: Falls back to `VERCEL_URL` or `http://localhost:3000`
- **Used In**: 
  - `app/api/users/[userId]/local-env/route.ts`
- **Notes**: Used to generate WebSocket connection URLs for browser bridge

### 9. `HOSTNAME`
- **Type**: String (optional)
- **Purpose**: Server hostname for custom server
- **Default**: `localhost`
- **Used In**: 
  - `server.js`
- **Notes**: Only used when running custom server (`pnpm dev`)

### 10. `PORT`
- **Type**: Number/String (optional)
- **Purpose**: Server port for custom server
- **Default**: `3000`
- **Used In**: 
  - `server.js`
- **Notes**: Only used when running custom server (`pnpm dev`)

### 11. `VERCEL_URL`
- **Type**: String (auto-set by Vercel)
- **Purpose**: Vercel deployment URL (automatically set by Vercel)
- **Used In**: 
  - `app/api/users/[userId]/local-env/route.ts`
- **Notes**: Automatically set by Vercel, used as fallback for `NEXT_PUBLIC_APP_URL`

### 12. `NODE_ENV`
- **Type**: String (auto-set)
- **Purpose**: Node.js environment (development/production)
- **Default**: `development` (if not set)
- **Used In**: 
  - `server.js`
  - `app/layout.tsx`
  - `lib/utils/logger.ts`
  - `app/api/health/route.ts`
- **Notes**: Automatically set by Next.js/Vercel, typically `production` in Vercel

## Environment File Structure

### Current Setup
- **Primary File**: `.env.local` (not tracked in git)
- **Example File**: `.env.example` (should exist but currently missing)
- **Git Ignore**: `.env*.local` and `.env` are ignored

### Recommended Structure
```
.env.local          # Local development (gitignored)
.env.example        # Template with placeholders (tracked in git)
.env.production     # Production overrides (if needed, gitignored)
```

## Environment Variable Usage by Feature

### Authentication (Clerk)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required)
- `CLERK_SECRET_KEY` (required)

### LLM/Chat Features
- `GEMINI_API_KEY` (required for chat)
- `BRAVE_API_KEY` (optional, for search)

### Browser Automation
- `BROWSER_SERVICE_URL` (optional, server-side)
- `NEXT_PUBLIC_BROWSER_SERVICE_URL` (optional, client-side)

### Filesystem Operations
- `WORKSPACE_ROOT` (optional)

### Server Configuration
- `HOSTNAME` (optional, custom server only)
- `PORT` (optional, custom server only)
- `NODE_ENV` (auto-set)

### Deployment
- `NEXT_PUBLIC_APP_URL` (optional, for WebSocket URLs)
- `VERCEL_URL` (auto-set by Vercel)

## Validation

### Clerk Variables
- Validated in `lib/utils/clerk-env.ts` using Zod
- Throws error if missing in production
- Warns but continues in development

### General Variables
- Validated in `lib/utils/env.ts` using Zod
- `GEMINI_API_KEY` required for chat operations
- `GEMINI_API_KEY` optional for filesystem operations

## Environment Check Script

A script exists at `scripts/check-env.js` that:
- Loads `.env.local`
- Checks required variables
- Lists optional variables
- Provides helpful error messages

Run with: `node scripts/check-env.js`

## Recommendations

1. **Create `.env.example`**: Template file with all variables documented
2. **Document Defaults**: Clearly document default values in code
3. **Consolidate Browser URLs**: Consider using single `BROWSER_SERVICE_URL` with automatic `NEXT_PUBLIC_` prefix
4. **Environment-Specific Files**: Consider `.env.development` and `.env.production` patterns
5. **Type Safety**: Continue using Zod schemas for validation
6. **Documentation**: Keep this audit updated as new variables are added

## Vercel Deployment Checklist

Ensure these are set in Vercel project settings:
- ✅ `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- ✅ `CLERK_SECRET_KEY`
- ✅ `GEMINI_API_KEY`
- ⚠️ `NEXT_PUBLIC_APP_URL` (if using browser bridge)
- ⚠️ `BROWSER_SERVICE_URL` (if using browser automation)
- ⚠️ `BRAVE_API_KEY` (if using search features)
- ⚠️ `WORKSPACE_ROOT` (if needed for filesystem operations)

Note: `VERCEL_URL` and `NODE_ENV` are automatically set by Vercel.

