# Quick Fixes Guide - Launch Readiness

This document provides quick fixes for the most critical issues blocking launch.

## 🔴 Critical Fixes (Do These First)

### 1. Fix TypeScript Errors

#### Install Missing Type Definitions
```bash
pnpm add -D @types/busboy
```

#### Fix Busboy Types in `app/api/pdf/upload/route.ts`
Add proper types for busboy handlers:
```typescript
import busboy from 'busboy';
import type { FileInfo } from 'busboy';

// In the handler function, add types:
.on('file', (name: string, fileStream: NodeJS.ReadableStream, info: FileInfo) => {
  // ... existing code
})
.on('field', (name: string, value: string) => {
  // ... existing code
})
.on('error', (err: Error) => {
  // ... existing code
})
```

#### Fix Buffer Type Issue (line 103)
```typescript
// Change from:
const blob = new Blob([buffer]);

// To:
const blob = new Blob([buffer.buffer]);
```

#### Fix Error Object Extensions
Create a custom error type or use type assertion:
```typescript
// Option 1: Type assertion
const error = err as Error & { error?: string; root?: string; status?: number };

// Option 2: Create custom error interface
interface ExtendedError extends Error {
  error?: string;
  root?: string;
  status?: number;
}
```

### 2. Fix Browser API Types

#### Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext", "webworker"]
  }
}
```

#### Or create `types/browser.d.ts`:
```typescript
interface Window {
  showDirectoryPicker?: (options?: { multiple?: boolean }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}
```

### 3. Fix LocalEnvBridge Class Properties

#### Add to `lib/browser/local-env-bridge.ts` class:
```typescript
export class LocalEnvBridge {
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pingInterval: NodeJS.Timeout | null = null;
  
  // ... rest of class
}
```

### 4. Fix WebSocket Types

#### In `lib/infrastructure/bridge-manager.ts`:
```typescript
import { WebSocket } from 'ws';

// Use WebSocket from 'ws' package instead of browser WebSocket
```

### 5. Add Clerk Environment Validation

#### Create `lib/utils/clerk-env.ts`:
```typescript
import { z } from 'zod';

const clerkEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "Clerk publishable key is required"),
  CLERK_SECRET_KEY: z.string().min(1, "Clerk secret key is required"),
});

export function getClerkEnv() {
  const env = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  };

  try {
    return clerkEnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map((e) => e.path.join(".")).join(", ");
      throw new Error(`Missing or invalid Clerk environment variables: ${missing}`);
    }
    throw error;
  }
}
```

#### Add to `app/layout.tsx`:
```typescript
import { getClerkEnv } from '@/lib/utils/clerk-env';

// Call at module level or in a startup check
if (typeof window === 'undefined') {
  try {
    getClerkEnv();
  } catch (error) {
    console.error('Clerk configuration error:', error);
    // In production, you might want to throw here
  }
}
```

### 6. Add Startup Environment Validation

#### Create `scripts/validate-env.ts`:
```typescript
#!/usr/bin/env ts-node
import { getChatEnv } from '../lib/utils/env';
import { getClerkEnv } from '../lib/utils/clerk-env';

console.log('Validating environment variables...');

try {
  getClerkEnv();
  console.log('✅ Clerk environment variables validated');
} catch (error) {
  console.error('❌ Clerk validation failed:', error);
  process.exit(1);
}

try {
  getChatEnv();
  console.log('✅ Chat environment variables validated');
} catch (error) {
  console.error('❌ Chat validation failed:', error);
  process.exit(1);
}

console.log('✅ All environment variables validated');
```

#### Add to `package.json`:
```json
{
  "scripts": {
    "validate-env": "ts-node scripts/validate-env.ts",
    "prebuild": "pnpm validate-env"
  }
}
```

## 🟡 High Priority Fixes

### 7. Add Health Check Endpoint

#### Create `app/api/health/route.ts`:
```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
}
```

### 8. Add Path Traversal Protection

#### Update `lib/storage/local-fs.ts`:
```typescript
async resolve(filePath: string, context: UserContext): Promise<string> {
  const workspaceRoot = this.getWorkspaceRoot(context);
  
  if (path.isAbsolute(filePath)) {
    const normalized = path.normalize(filePath);
    // Prevent directory traversal
    if (!normalized.startsWith(workspaceRoot)) {
      throw new FileSystemError(
        `Path outside workspace root: ${filePath}`,
        filePath
      );
    }
    return normalized;
  }
  
  const resolved = path.resolve(workspaceRoot, filePath);
  const normalized = path.normalize(resolved);
  
  // Ensure resolved path is within workspace
  if (!normalized.startsWith(path.resolve(workspaceRoot))) {
    throw new FileSystemError(
      `Path traversal detected: ${filePath}`,
      filePath
    );
  }
  
  return normalized;
}
```

### 9. Add Command Sanitization

#### Update `lib/tools/executor.ts`:
```typescript
private sanitizeCommand(command: string): string {
  // Remove dangerous characters
  const dangerous = [';', '&&', '||', '|', '`', '$', '<', '>'];
  let sanitized = command;
  
  for (const char of dangerous) {
    if (sanitized.includes(char)) {
      throw new ExecutionError(
        `Command contains potentially dangerous character: ${char}`,
        command
      );
    }
  }
  
  return sanitized;
}

async execute(command: string, ...) {
  const sanitized = this.sanitizeCommand(command);
  // ... rest of execute method using sanitized
}
```

## 🟢 Medium Priority Fixes

### 10. Add Rate Limiting

Install:
```bash
pnpm add @upstash/ratelimit @upstash/redis
```

Or use a simpler in-memory solution for MVP.

### 11. Add Error Tracking

Install Sentry:
```bash
pnpm add @sentry/nextjs
```

Initialize in `next.config.ts` or create `sentry.client.config.ts`.

## Testing After Fixes

1. Run type check:
```bash
pnpm run type-check
```

2. Run build:
```bash
pnpm run build
```

3. Run tests:
```bash
pnpm test
```

4. Test locally:
```bash
pnpm dev
```

## Next Steps

After fixing critical issues:
1. Review `LAUNCH_AUDIT.md` for remaining items
2. Test all critical user flows
3. Deploy to staging environment
4. Run security scan
5. Performance testing
6. Final production deployment

