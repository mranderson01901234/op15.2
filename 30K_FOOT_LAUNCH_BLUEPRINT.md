# 30k-Foot Launch Blueprint

- **Date**: 2025-11-11
- **Repo SHA**: not-a-git-repo (local development)
- **Next.js Version**: 16.0.1
- **React Version**: 19.2.0
- **Node Runtime**: Node.js (via custom server.js)

---

## 1. Product & Features

### Elevator Pitch
A production-ready LLM assistant that enables users to interact with their local filesystem, execute commands, search the web, generate images, and process PDFs through natural language. Built on Next.js 15/React 19 with Clerk authentication, streaming chat interface, and browser bridge for File System Access API integration.

### Primary User Roles
- **End User**: Developer/technical user who wants AI assistance with local file operations, code editing, command execution, and research
- **Admin**: (TBD) Future role for managing users, workspaces, and system configuration

### Core Use Cases
1. File operations (list, read, write, move, copy, delete, create directories)
2. Command execution (shell commands with streaming output)
3. Code editing (open files in editor, edit with AI assistance)
4. Web search (Brave Search API integration)
5. Image generation (Google Imagen 4.0)
6. PDF processing (text extraction, analysis, multi-PDF support)
7. Filesystem indexing (fuzzy path lookup, RAG-enabled semantic search)
8. Text search (regex pattern matching across files)

### Feature Readiness Matrix

| Feature | Status | Owner | Risk | Notes |
|---------|--------|-------|------|-------|
| **Core Chat** | Ready | - | Low | Streaming SSE, tool calling, conversation history |
| **fs.list** | Ready | - | Low | Browser bridge + server fallback |
| **fs.read** | Ready | - | Low | Browser bridge + server fallback |
| **fs.write** | Ready | - | Medium | No path traversal protection (see Security) |
| **fs.move** | Ready | - | Medium | No path traversal protection |
| **fs.copy** | Ready | - | Medium | No path traversal protection |
| **fs.delete** | Ready | - | High | Destructive, no confirmation in API |
| **fs.create** | Ready | - | Low | Directory creation |
| **exec.run** | Ready | - | **Critical** | No sandboxing, runs as server user |
| **index.scan** | Ready | - | Low | In-memory + JSON persistence |
| **index.find** | Ready | - | Low | Fuzzy path matching |
| **text.search** | Ready | - | Low | Regex search with context |
| **editor.open** | Ready | - | Low | Opens files in CodeMirror editor |
| **brave.search** | Ready | - | Low | Requires BRAVE_API_KEY (optional) |
| **imagen.generate** | Ready | - | Low | Requires GEMINI_API_KEY |
| **PDF Upload** | Ready | - | Low | Multi-PDF support, inline/file API |
| **PDF Analysis** | Ready | - | Low | Text, images, tables, charts |
| **RAG/File Search** | Ready | - | Low | Google File Search API integration |
| **WebSocket Bridge** | Ready | - | Medium | Custom server required, not serverless-compatible |
| **Clerk Auth** | Ready | - | Low | Integrated in middleware + API routes |
| **Workspace Sync** | Needs polish | - | Medium | Browser → cloud sync for exec.run |
| **Rate Limiting** | **Blocked** | - | **High** | Not implemented |
| **Path Traversal Protection** | **Blocked** | - | **Critical** | Not enforced |
| **Command Sandboxing** | **Blocked** | - | **Critical** | Runs directly on server |
| **Multi-tenant Isolation** | Needs polish | - | Medium | User context present, not fully enforced |
| **Error Boundaries** | Needs polish | - | Medium | Basic error handling, no React error boundaries |
| **Offline Support** | Defer | - | Low | Post-GA |
| **i18n** | Defer | - | Low | English only, post-GA |
| **Accessibility** | Needs polish | - | Medium | Basic ARIA, needs audit |

### Nice-to-Have (Post-GA)
- Advanced workspace management (persistent storage, Redis caching)
- Database-backed index (PostgreSQL instead of JSON files)
- Sandboxed command execution (Docker containers)
- Advanced rate limiting (per-user quotas)
- Audit logging (comprehensive operation logs)
- Webhook integrations
- CLI tool
- Mobile app

### Defer-to-Post-GA
- Multi-workspace support per user
- Team collaboration features
- Advanced RAG features (vector search, embeddings)
- Custom tool/function definitions
- Plugin system

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   React UI   │  │ File System │  │  WebSocket Bridge   │  │
│  │   (Next.js)  │  │ Access API  │  │   (Browser Bridge)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
│         │ HTTP/SSE         │                      │ WebSocket    │
└─────────┼──────────────────┼──────────────────────┼──────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Edge/Next.js API Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  /api/chat   │  │ /api/filesys │  │  /api/bridge (WS)    │  │
│  │  (SSE Stream)│  │  tem/*        │  │  /api/workspace/*    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
│         │                  │                      │              │
│  ┌──────▼──────────────────▼──────────────────────▼──────────┐  │
│  │              Clerk Middleware (Auth)                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Services/Workers Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Gemini Client│  │ Tool Executor│  │  Bridge Manager       │  │
│  │ (LLM Stream) │  │ (exec.run)   │  │  (WebSocket Mgr)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
│  ┌──────▼──────────────────▼──────────────────────▼──────────┐  │
│  │              Tool Handlers Layer                            │  │
│  │  fs.* | exec.* | index.* | text.* | editor.* | brave.*   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Storage/Data Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ LocalFileSys │  │ MemoryIndex  │  │  File Search Store    │  │
│  │ (Node.js fs) │  │ (index.json) │  │  (Google API)        │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Workspace Storage (in-memory Map, /tmp for synced files) │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Google Gemini│  │ Brave Search │  │  Google Imagen 4.0    │  │
│  │   API        │  │     API      │  │  (via Gemini API)     │  │
│  └──────────────┘  └───────────────┘  └───────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Clerk Authentication Service                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Legend:
  ⇄ HTTP/SSE (Server-Sent Events)
  ⇅ WebSocket (persistent connection)
  ⇄ External API calls
```

---

## 3. AuthN/AuthZ

### Current Auth Provider
- **Provider**: Clerk (`@clerk/nextjs` v6.35.0)
- **Middleware**: `middleware.ts` uses `clerkMiddleware()` for all routes except static files
- **Auth Check**: All API routes verify `userId` via `auth()` from `@clerk/nextjs/server`

### Session Model
- **Session Type**: Clerk-managed sessions (JWT-based)
- **Token Lifetime**: Managed by Clerk (default: 7 days)
- **Cookie Settings**: Clerk default (HttpOnly, Secure in production, SameSite=Lax)
- **Session Storage**: Clerk handles session persistence

### Token Lifetimes
- **Access Token**: Clerk-managed (short-lived, refreshed automatically)
- **Refresh Token**: Clerk-managed (long-lived)
- **API Token**: N/A (using Clerk user sessions)

### Cookie Settings
- **HttpOnly**: Yes (Clerk default)
- **Secure**: Yes in production (Clerk default)
- **SameSite**: Lax (Clerk default)
- **Domain**: Set by Clerk based on deployment domain

### Role/Permission Matrix

| Role | fs.* | exec.run | index.* | brave.search | imagen.generate | PDF Upload | Workspace Sync |
|------|------|----------|---------|--------------|-----------------|-------------|----------------|
| **Authenticated User** | ✅ | ✅ | ✅ | ✅ (if API key set) | ✅ (if API key set) | ✅ | ✅ |
| **Unauthenticated** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Enforcement Points**:
- **API Routes**: All routes check `auth()` and return 401 if no `userId`
- **Server**: No additional RBAC checks (all authenticated users have same permissions)
- **UI**: Clerk components handle auth state (`useUser()`, `FloatingAuthButtons`)

### Multi-tenant/User Isolation Model

**Current Implementation**:
- **User Context**: `UserContext` interface includes `userId` and optional `workspaceId`
- **Isolation Level**: **Partial** - User context passed to tools, but:
  - File operations use `WORKSPACE_ROOT` env var (shared across users) or `process.cwd()`
  - Index storage (`index.json`) is shared (user keys stored but file is global)
  - Workspace sync uses in-memory Map keyed by `userId` (not persistent)
  - No database-level isolation

**Isolation Gaps**:
1. **File System**: All users share same `WORKSPACE_ROOT` (no per-user directories)
2. **Index Storage**: `index.json` is global file (user data mixed)
3. **Workspace Sync**: In-memory only, lost on restart
4. **Command Execution**: Runs in shared workspace root

**Tests to Prove Isolation**:
- ❌ **Not implemented** - No isolation tests exist
- **TODO**: Add tests that verify:
  - User A cannot access User B's files
  - User A cannot see User B's index entries
  - User A cannot access User B's workspace sync data

### Secrets Management Inventory

| Secret | Location | Required | Rotation Plan | Notes |
|--------|----------|----------|---------------|-------|
| `GEMINI_API_KEY` | `.env.local` | ✅ Yes | Manual | Google Cloud Console |
| `BRAVE_API_KEY` | `.env.local` | ⚠️ Optional | Manual | Brave Search API dashboard |
| `CLERK_SECRET_KEY` | `.env.local` | ✅ Yes | Clerk dashboard | Clerk manages rotation |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | ✅ Yes | Clerk dashboard | Public, safe to expose |
| `WORKSPACE_ROOT` | `.env.local` | ⚠️ Optional | Manual | Defaults to `process.cwd()` |
| `NEXT_PUBLIC_APP_URL` | `.env.local` | ⚠️ Production | Manual | For workspace sync URLs |
| `PORT` | `.env.local` | ⚠️ Optional | N/A | Defaults to 3000 |
| `HOSTNAME` | `.env.local` | ⚠️ Optional | N/A | Defaults to localhost |

**Rotation Plan**:
- **Clerk**: Automatic (managed by Clerk)
- **Gemini/Brave**: Manual rotation via API dashboard, update `.env.local`, restart server
- **TODO**: Implement secret rotation workflow (env var validation on startup, graceful handling of invalid keys)

---

## 4. API Surface (HTTP)

### API Routes Inventory

| Method | Path | Auth | Rate Limit | Request Type | Response Type | Idempotency Key |
|--------|------|------|------------|--------------|----------------|-----------------|
| **POST** | `/api/chat` | ✅ Required | ❌ None | `ChatRequest` (zod) | `text/event-stream` (SSE) | ❌ No |
| **POST** | `/api/filesystem/list` | ✅ Required | ❌ None | `{ path: string, depth?: number }` | `{ entries: FileEntry[] }` | ❌ No |
| **POST** | `/api/filesystem/read` | ✅ Required | ❌ None | `{ path: string, encoding?: string }` | `{ content: string }` | ❌ No |
| **POST** | `/api/filesystem/write` | ✅ Required | ❌ None | `{ path: string, content: string, createDirs?: boolean }` | `{ success: boolean }` | ❌ No |
| **POST** | `/api/filesystem/root` | ✅ Required | ❌ None | `{}` | `{ root: string }` | ❌ No |
| **GET** | `/api/bridge` | ✅ Required | ❌ None | Query: `?userId=...` | `426 Upgrade Required` (WS) | ❌ No |
| **POST** | `/api/workspace/sync` | ✅ Required | ❌ None | `{ files: Array<{path, content}> }` | `{ success: boolean, workspacePath: string }` | ❌ No |
| **POST** | `/api/workspace/metadata` | ✅ Required | ❌ None | `{ rootPath: string }` | `{ success: boolean }` | ❌ No |
| **POST** | `/api/users/[userId]/local-env` | ✅ Required | ❌ None | `{}` | `{ serverUrl: string, token: string }` | ❌ No |
| **POST** | `/api/file-search/upload` | ✅ Required | ❌ None | `{ filePath: string, storeDisplayName: string, displayName?: string }` | `{ success: boolean, storeName: string }` | ❌ No |
| **POST** | `/api/file-search/upload-batch` | ✅ Required | ❌ None | `{ files: Array<{filePath, options}>, storeDisplayName: string }` | `{ success: boolean, storeName: string }` | ❌ No |
| **GET** | `/api/file-search/stores` | ✅ Required | ❌ None | Query: `?storeDisplayName=...` | `{ stores: Array<{name, displayName}> }` | ❌ No |
| **POST** | `/api/imagen/generate` | ✅ Required | ❌ None | `{ prompt: string, numberOfImages?: number, ... }` | `{ success: boolean, images: Array<{dataUrl, mimeType}> }` | ❌ No |
| **POST** | `/api/pdf/upload` | ✅ Required | ❌ None | `FormData` (multipart) | `{ success: boolean, pdfId: string }` | ❌ No |

### Contract Snippets (TypeScript/Zod)

#### `/api/chat` Request
```typescript
const requestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  fileSearchStoreNames: z.array(z.string()).optional(),
  pdfs: z.array(z.object({
    type: z.enum(['inline', 'file_api']),
    data: z.string(),
    mimeType: z.literal('application/pdf'),
    displayName: z.string().optional(),
  })).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    images: z.array(z.object({
      dataUrl: z.string(),
      mimeType: z.string(),
    })).optional(),
  })).optional(),
  editorState: z.object({
    filePath: z.string().nullable(),
    isOpen: z.boolean(),
  }).optional(),
  currentMessageImages: z.array(z.object({
    dataUrl: z.string(),
    mimeType: z.string(),
  })).optional(),
});
```

#### `/api/chat` Response (SSE Stream)
```typescript
// SSE events:
type StreamEvent =
  | { type: "text", content: string }
  | { type: "function_call", functionCall: { name: string, args: Record<string, unknown> } }
  | { type: "function_response", functionResponse: { name: string, response: unknown } }
  | { type: "editor_open", path: string, content: string }
  | { type: "editor_update", path: string, content: string }
  | { type: "image_generated", imageUrl: string }
  | { type: "formatted_search", query: string, images: Image[], videos: Video[], ... }
  | { type: "error", error: string }
  | "[DONE]"; // Completion marker
```

#### `/api/filesystem/list` Request/Response
```typescript
// Request
const requestSchema = z.object({
  path: z.string().min(1),
  depth: z.number().optional().default(0),
});

// Response
type FileEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  mtime?: string; // ISO string
};
```

### Versioning Policy
- **Current Version**: v1 (implicit, no version prefix)
- **Versioning Strategy**: **TBD** - No versioning implemented
- **Deprecation Plan**: **TBD** - No deprecation policy

**Recommendations**:
- Add `/api/v1/` prefix to all routes
- Implement version negotiation via `Accept: application/vnd.op15.v1+json`
- Document breaking changes and deprecation timeline

---

## 5. WebSocket/Realtime

### WebSocket Endpoints

| Endpoint | Path | Auth | Direction | Payload Type | AuthZ | Delivery Guarantees |
|----------|------|------|-----------|--------------|-------|---------------------|
| **Bridge** | `/api/bridge?userId=...` | ✅ Query param + Clerk session | Bidirectional | `BridgeRequest` / `BridgeResponse` | Per-user isolation | At-most-once (no retry) |

### Event Names & Payload Schemas

#### Client → Server (Browser → Cloud)
```typescript
interface BridgeRequest {
  id: string; // `${userId}-${timestamp}-${random}`
  operation: "fs.list" | "fs.read" | "fs.write" | "exec.run";
  path?: string;
  content?: string;
  command?: string;
  [key: string]: unknown;
}
```

#### Server → Client (Cloud → Browser)
```typescript
interface BridgeResponse {
  id: string; // Matches request ID
  data?: unknown; // Operation result
  error?: string; // Error message if failed
}

// Connection events
interface ConnectionEvent {
  type: "connected";
  userId: string;
}
```

### Back-pressure & Fan-out Strategy

**Current Implementation**:
- **Back-pressure**: ❌ Not implemented - WebSocket sends without back-pressure
- **Fan-out**: Single connection per user (1:1 mapping)
- **Queue**: In-memory `pendingRequests` Map (lost on restart)

**Issues**:
- No message queue for offline users
- No rate limiting on WebSocket messages
- No back-pressure handling (browser can flood server)

**Recommendations**:
- Implement message queue per user (Redis/pub-sub)
- Add rate limiting (max N messages per second per user)
- Add back-pressure: pause sending if browser buffer full

### Auth on WS Connect

**Current Flow**:
1. Browser connects to `/api/bridge?userId=...`
2. Server extracts `userId` from query param
3. Server verifies Clerk session (via middleware/auth)
4. If valid, connection established; else close with code 1008

**Security Gaps**:
- ✅ Query param validated against Clerk session
- ⚠️ No token-based auth (relies on HTTP session cookie)
- ⚠️ No re-authentication on long-lived connections

### Per-message Authorization

**Current Implementation**:
- All messages from authenticated user are trusted
- No per-operation authorization checks
- User can request any operation (fs.*, exec.run)

**Recommendations**:
- Add operation whitelist per user (future: role-based)
- Validate operation names against allowed set
- Log all operations for audit

### Disconnect/Error Policy

**Current Implementation**:
- **Disconnect**: Cleanup `pendingRequests`, remove from `bridges` Map
- **Error**: Log error, close connection, cleanup
- **Reconnect**: Browser must reconnect manually (no auto-reconnect)

**Ping/Pong**:
- Server sends ping every 30 seconds
- Browser responds with pong (or JSON `{type: "pong"}`)
- Missing pong → connection considered dead

**Timeout**:
- Request timeout: 30 seconds
- Connection timeout: None (relies on ping/pong)

### Horizontal Scale Plan

**Current Architecture**: **Sticky Sessions** (in-memory Map)

**Issues**:
- WebSocket connections stored in memory (`bridges` Map)
- Not compatible with serverless (Vercel/Netlify)
- Requires single server instance (no horizontal scaling)

**Production Options**:

1. **WebSocket Service** (Recommended)
   - Use Pusher, Ably, or Socket.io with Redis adapter
   - Handles scaling, reconnection, message queuing
   - Cost: ~$20-100/month for moderate traffic

2. **Pub/Sub Layer** (Alternative)
   - Redis Pub/Sub for message routing
   - Sticky sessions via load balancer
   - Custom WebSocket server per instance

3. **SSE Alternative** (Simplest)
   - Replace WebSocket with Server-Sent Events
   - Works with serverless, but one-way only
   - Would require polling for browser → server messages

**Recommendation**: Use Pusher/Ably for production (easiest migration path)

---

## 6. MCP / Tool-Calling Inventory

### Tool Registry

| Tool | Purpose | Params Schema | Output | Side-Effects | Guardrails | Consent |
|------|----------|---------------|--------|--------------|------------|---------|
| **fs.list** | List files/directories | `{ path: string, depth?: number }` | `Array<FileEntry>` | None (read-only) | Path resolution via `WORKSPACE_ROOT` | None |
| **fs.read** | Read file content | `{ path: string, encoding?: string }` | `{ content: string }` | None (read-only) | Path resolution | None |
| **fs.write** | Write file content | `{ path: string, content: string, createDirs?: boolean }` | `{ success: boolean }` | Creates/overwrites file | ⚠️ No path traversal check | ⚠️ No confirmation |
| **fs.move** | Move/rename file | `{ source: string, destination: string, createDestDirs?: boolean }` | `{ success: boolean }` | Moves file | ⚠️ No path traversal check | ⚠️ No confirmation |
| **fs.copy** | Copy file/directory | `{ source: string, destination: string, recursive?: boolean }` | `{ success: boolean }` | Copies file | ⚠️ No path traversal check | None |
| **fs.delete** | Delete file/directory | `{ path: string, recursive?: boolean }` | `{ success: boolean }` | **Destructive** | ⚠️ No path traversal check | ⚠️ No confirmation |
| **fs.create** | Create directory | `{ path: string, recursive?: boolean }` | `{ success: boolean }` | Creates directory | ⚠️ No path traversal check | None |
| **exec.run** | Execute shell command | `{ command: string, cwd?: string, timeoutMs?: number }` | `{ exitCode: number, stdout: string, stderr: string }` | **Runs arbitrary commands** | ⚠️ **No sandboxing** | ⚠️ No confirmation |
| **index.scan** | Index filesystem | `{ root: string, maxDepth?: number, enableRAG?: boolean, ... }` | `{ count: number, ragStoreName?: string }` | Creates index, uploads to RAG | Max depth: 4 default | None |
| **index.find** | Search index | `{ query: string, limit?: number }` | `{ matches: string[], count: number }` | None (read-only) | None | None |
| **text.search** | Regex search files | `{ path: string, pattern: string, caseSensitive?: boolean, ... }` | `{ matches: number, results: Array<{file, line, match}> }` | None (read-only) | Max results: 100 | None |
| **editor.open** | Open file in editor | `{ path: string, encoding?: string }` | `{ success: boolean, path: string, content: string }` | Sends `editor_open` event | Path resolution | None |
| **brave.search** | Web search | `{ query: string, count?: number, safesearch?: string, ... }` | `{ query: string, results: Array<...>, images?: Image[], ... }` | External API call | Rate limit: Brave API (unknown) | None |
| **imagen.generate** | Generate image | `{ prompt: string, numberOfImages?: number, aspectRatio?: string, ... }` | `{ success: boolean, images: Array<{dataUrl, mimeType}> }` | External API call | Rate limit: Gemini API | None |

### Filesystem + Exec Tools

**Allowed Roots**:
- `WORKSPACE_ROOT` env var (defaults to `process.cwd()`)
- Paths resolved relative to `WORKSPACE_ROOT`
- Absolute paths normalized but **not restricted** (security gap)

**Allow/Deny Globs**: ❌ **Not implemented**

**Current Behavior**:
- All paths allowed (no validation)
- Path traversal possible (`../../../etc/passwd`)
- No sandboxing for `exec.run`

**Dry-run Mode**: ❌ **Not implemented**

**Recommendations**:
- Enforce `WORKSPACE_ROOT` boundary strictly
- Reject paths outside workspace (throw error)
- Add allowlist/denylist globs for sensitive directories
- Implement dry-run mode for destructive operations

### External Connectors

#### Google Gemini API
- **Scopes**: Read/write (API key)
- **Rate Limits**: Unknown (handles 503 with exponential backoff)
- **Consent Flow**: None (API key required)
- **Usage**: Chat completion, image generation (Imagen 4.0)

#### Brave Search API
- **Scopes**: Search (API key)
- **Rate Limits**: Unknown (per subscription tier)
- **Consent Flow**: None (API key required)
- **Usage**: Web search, image/video search

#### Google File Search API (RAG)
- **Scopes**: Read/write (via Gemini API key)
- **Rate Limits**: Unknown
- **Consent Flow**: None
- **Usage**: File upload for semantic search, RAG stores

#### Clerk Authentication
- **Scopes**: User authentication, session management
- **Rate Limits**: Clerk-managed
- **Consent Flow**: OAuth flow (handled by Clerk)
- **Usage**: All API routes require Clerk auth

---

## 7. Data + Storage

### Databases
- **Primary DB**: ❌ **None** - No database used
- **Index Storage**: JSON file (`index.json`, `index-rag.json`)
- **Workspace Storage**: In-memory Map (`global.userWorkspaces`)

### File-based Storage

| Storage Type | Location | Format | Retention/TTL | Notes |
|--------------|----------|--------|---------------|-------|
| **Index** | `./index.json` | JSON | Persistent | User data mixed (no isolation) |
| **RAG Metadata** | `./index-rag.json` | JSON | Persistent | Maps user → root → storeName |
| **Workspace Sync** | `/tmp/op15-workspaces/{userId}/` | Files | **No TTL** (manual cleanup) | Synced files from browser |
| **Logs** | Console/stdout | Text | N/A | No persistent logging |

### Tables/Collections

**N/A** - No database tables. Data stored in:
- JSON files (index)
- In-memory Maps (workspaces, bridges)
- File system (synced workspaces)

### Migrations Status
- **Migrations**: ❌ **N/A** - No database
- **Seed Strategy**: ❌ **N/A** - No seed data

### PII Map

| Data Type | Storage Location | Handling Policy | Retention |
|-----------|------------------|-----------------|-----------|
| **User ID** | Clerk sessions, API logs, index.json | Stored as-is | Clerk-managed |
| **File Paths** | index.json, API logs | Stored as absolute paths | Persistent |
| **File Contents** | Workspace sync (/tmp), RAG stores (Google) | Stored temporarily | No TTL |
| **Command Output** | API logs (stdout) | Logged | No retention policy |
| **Search Queries** | API logs | Logged | No retention policy |
| **PDF Content** | In-memory during request | Not persisted | Request-scoped |

**Data Handling Policy**:
- ⚠️ **No explicit PII policy** - Should document what data is collected
- ⚠️ **No data retention policy** - Index files persist indefinitely
- ⚠️ **No data deletion** - No user data deletion endpoint

**Recommendations**:
- Document PII collection and usage
- Implement data retention policy (delete old index entries)
- Add user data deletion endpoint (GDPR compliance)

---

## 8. Frontend App Map

### Page/Route Tree

```
/ (app/page.tsx)
  ├── Chat Interface (main)
  ├── Sidebar Navigation (app-sidebar.tsx)
  ├── Editor Panel (split-view.tsx → codemirror-editor.tsx)
  ├── Image Viewer Panel (split-view.tsx → image-viewer.tsx)
  └── Local Env Connector (local-env-connector.tsx)
```

**Routes**:
- `/` - Main chat interface (only route)
- No other pages (single-page app)

### Critical Components

| Component | Purpose | State Management | Notes |
|-----------|---------|------------------|-------|
| **app/page.tsx** | Main chat UI | `useChat`, `useChatInput`, `useWorkspace` | 1232 lines, handles streaming |
| **app-sidebar.tsx** | Sidebar navigation | `useWorkspace` | File tree, navigation |
| **split-view.tsx** | Editor/image panels | `useWorkspace` | Conditional rendering |
| **codemirror-editor.tsx** | Code editor | `useWorkspace` | CodeMirror integration |
| **image-viewer.tsx** | Image display | `useWorkspace` | Zoom, pan, download |
| **local-env-connector.tsx** | Browser bridge setup | `useUser` (Clerk) | WebSocket connection |
| **chat-context.tsx** | Chat state | React Context | Message history, streaming |
| **workspace-context.tsx** | Workspace state | React Context | Editor state, image state |

### Global State Strategy

**Context Providers** (in `app/layout.tsx`):
1. `WorkspaceProvider` - Editor/image state, file operations
2. `ChatProvider` - Message history, streaming state
3. `ChatInputProvider` - Input state, PDF uploads
4. `SidebarProvider` - Sidebar collapse/expand

**State Storage**:
- **Client-side only** - No persistence (lost on refresh)
- **No Redux/Zustand** - Pure React Context
- **No localStorage** - State not persisted

### Error Boundaries
- ❌ **Not implemented** - No React error boundaries
- **Recommendation**: Add error boundary around main app, editor, and chat components

### Loading States
- ✅ **Implemented** - "processing..." indicator during streaming
- ✅ **Implemented** - Loading states for file operations (implicit via disabled buttons)

### Offline/Optimistic Strategies
- ❌ **Not implemented** - No offline support
- ❌ **Not implemented** - No optimistic updates

### Accessibility Checklist

| Item | Status | Notes |
|------|--------|-------|
| **ARIA labels** | ⚠️ Partial | Some buttons have labels, not comprehensive |
| **Keyboard navigation** | ⚠️ Partial | Tab navigation works, but not fully tested |
| **Screen reader support** | ❌ Unknown | Not tested with screen readers |
| **Color contrast** | ✅ Good | Dark theme with high contrast |
| **Focus indicators** | ⚠️ Partial | Some elements have focus styles |
| **Alt text for images** | ❌ Missing | Generated images lack alt text |

**Recommendations**:
- Add comprehensive ARIA labels
- Test with screen readers (NVDA/JAWS)
- Add alt text for generated images
- Improve keyboard navigation

### i18n Plan
- **Current**: English only
- **Plan**: Defer to post-GA
- **Framework**: TBD (likely `next-intl` or `react-i18next`)

---

## 9. Deployment/Environments

### Environments

| Environment | URL | Config Source | Notes |
|-------------|-----|---------------|-------|
| **Development** | `http://localhost:3000` | `.env.local` | Custom server.js with WebSocket |
| **Staging** | TBD | `.env.staging` | TBD - Not configured |
| **Production** | TBD | `.env.production` | TBD - Not configured |

### Configs Per Environment

**Development** (`.env.local`):
```bash
GEMINI_API_KEY=...
BRAVE_API_KEY=... (optional)
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
WORKSPACE_ROOT=... (optional)
NEXT_PUBLIC_APP_URL=http://localhost:3000
PORT=3000
HOSTNAME=localhost
```

**Production** (TBD):
- Same vars, but:
  - `NEXT_PUBLIC_APP_URL` = production domain
  - `WORKSPACE_ROOT` = production workspace path
  - `NODE_ENV=production`

### Infrastructure Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────┐
│                    Production (TBD)                      │
│                                                           │
│  ┌──────────────┐         ┌──────────────┐              │
│  │ Load Balancer │────────▶│  Next.js App │              │
│  │  (Nginx/ALB) │         │  (server.js) │              │
│  └──────────────┘         └──────┬───────┘              │
│                                   │                       │
│                          ┌────────▼────────┐            │
│                          │  WebSocket Server │            │
│                          │   (ws library)    │            │
│                          └───────────────────┘            │
│                                   │                       │
│                          ┌────────▼────────┐            │
│                          │  File System    │            │
│                          │  (WORKSPACE_ROOT)│            │
│                          └───────────────────┘            │
│                                                           │
│  External Services:                                       │
│  • Clerk (Auth)                                           │
│  • Google Gemini API                                      │
│  • Brave Search API                                       │
└─────────────────────────────────────────────────────────┘

Note: Current architecture requires single server instance
      (not compatible with serverless/Vercel)
```

### CI/CD Steps

**Current**: ❌ **Not configured**

**Recommended Pipeline**:
1. **Lint**: `pnpm lint`
2. **Type Check**: `pnpm type-check`
3. **Tests**: `pnpm test`
4. **Build**: `pnpm build`
5. **Deploy**: TBD (manual for now)

**Required Secrets** (for CI/CD):
- `GEMINI_API_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `BRAVE_API_KEY` (optional)

### Promotion Gates

**Current**: ❌ **None** - Manual deployment

**Recommended**:
- ✅ All tests pass
- ✅ Type check passes
- ✅ Lint passes
- ✅ Build succeeds
- ⚠️ Security scan (TBD)
- ⚠️ Performance budget (TBD)

### Rollback Plan

**Current**: ❌ **Not documented**

**Recommendation**:
- Keep previous build artifacts
- Document rollback procedure (restore previous build, restart server)
- Test rollback in staging

### Feature Flag Plan

**Current**: ❌ **Not implemented**

**Recommendation**:
- Use environment variables for feature flags
- Example: `ENABLE_RAG=true`, `ENABLE_IMAGE_GEN=true`
- Document feature flags in `.env.example`

---

## 10. Observability/SRE

### Logging Schema

**Current Implementation**:
- **Logger**: Custom logger (`lib/utils/logger.ts`)
- **Format**: Structured JSON logs (console output)
- **Levels**: `info`, `warn`, `error`, `debug`
- **Storage**: Console/stdout only (no persistent storage)

**Log Schema**:
```typescript
{
  level: "info" | "warn" | "error" | "debug",
  message: string,
  userId?: string,
  error?: Error,
  [key: string]: unknown // Additional context
}
```

**Gaps**:
- ❌ No log aggregation (CloudWatch, Datadog, etc.)
- ❌ No log retention policy
- ❌ No structured log querying

### Tracing

**Current**: ❌ **Not implemented**

**Recommendation**:
- Add OpenTelemetry tracing
- Trace: API requests, tool calls, external API calls
- Export to: Jaeger, Datadog APM, or CloudWatch X-Ray

### Metrics

**Current**: ❌ **Not implemented**

**Recommended Metrics**:
- Request rate (per endpoint)
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- Tool execution time (per tool)
- WebSocket connection count
- Active users
- Gemini API latency
- File operations (read/write counts)

**Export To**: Prometheus + Grafana, or Datadog, or CloudWatch

### Dashboards

**Current**: ❌ **None**

**Recommended Dashboards**:
1. **API Health**: Request rate, error rate, latency
2. **Tool Usage**: Tool call counts, execution times
3. **User Activity**: Active users, sessions
4. **External APIs**: Gemini/Brave API latency, error rates
5. **WebSocket**: Connection count, message rate

### Alerts

**Current**: ❌ **None**

**Recommended Alerts**:

| Alert | Threshold | On-call Runbook |
|-------|-----------|-----------------|
| **High Error Rate** | > 5% 5xx errors for 5 min | Check logs, restart if needed |
| **High Latency** | p95 > 5s for 5 min | Check external APIs, server load |
| **WebSocket Disconnects** | > 10% disconnect rate | Check server health, network |
| **Gemini API Errors** | > 10 errors/min | Check API key, quota, retry logic |
| **Disk Space** | < 10% free | Cleanup workspace sync files |
| **Memory Usage** | > 80% | Check for memory leaks, restart |

### SLOs

**Current**: ❌ **Not defined**

**Recommended SLOs**:

| SLO | Target | Error Budget |
|-----|--------|--------------|
| **Availability** | 99.9% uptime | 43.2 min/month downtime |
| **Latency** | p95 < 2s | 5% of requests can exceed |
| **Error Rate** | < 0.1% 5xx errors | 0.1% error budget |

---

## 11. Security Hardening Pre-GA

### Security Checklist

| Check | Status | Action Required |
|-------|--------|-----------------|
| **Auth/Session** | ✅ Pass | Clerk handles sessions securely |
| **CSRF** | ✅ Pass | Next.js handles CSRF tokens |
| **CORS** | ⚠️ Review | No explicit CORS config (Next.js default) |
| **SSRF** | ❌ **Fail** | `exec.run` can make network requests |
| **Path Traversal** | ❌ **Fail** | No path validation (can access `../../../etc/passwd`) |
| **RCE** | ❌ **Fail** | `exec.run` runs arbitrary commands unsandboxed |
| **Rate Limits** | ❌ **Fail** | No rate limiting implemented |
| **DoS** | ❌ **Fail** | No request size limits, no rate limits |
| **Object-level Auth** | ⚠️ Partial | User context passed but not enforced |
| **Header Hardening** | ⚠️ Review | No security headers (CSP, HSTS, etc.) |
| **Secrets Management** | ⚠️ Review | Env vars only, no rotation |
| **Input Validation** | ✅ Pass | Zod schemas validate inputs |
| **SQL Injection** | ✅ N/A | No database |
| **XSS** | ✅ Pass | React escapes by default |
| **Dependency Vulnerabilities** | ⚠️ Review | Run `pnpm audit` |

### Critical Security Fixes (Pre-GA)

#### 1. Path Traversal Protection
**Priority**: **Critical**
**Fix**:
```typescript
// In LocalFileSystem.resolve()
const workspaceRoot = this.getWorkspaceRoot(context);
const resolved = path.resolve(workspaceRoot, filePath);
const normalized = path.normalize(resolved);

if (!normalized.startsWith(path.resolve(workspaceRoot))) {
  throw new FileSystemError("Path outside workspace root");
}
```

#### 2. Command Execution Sandboxing
**Priority**: **Critical**
**Options**:
- **Option A**: Docker containers (recommended)
- **Option B**: Restricted shell (limited command set)
- **Option C**: Timeout + resource limits (minimum)

**Minimum Fix**:
- Add command whitelist (only allow safe commands)
- Enforce timeout (already implemented)
- Restrict working directory to `WORKSPACE_ROOT`

#### 3. Rate Limiting
**Priority**: **High**
**Fix**: Use `@upstash/ratelimit` or similar
```typescript
// Per-user rate limits
const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 req/min
});
```

#### 4. SSRF Protection
**Priority**: **High**
**Fix**: Block network requests in `exec.run` (or sandbox)
- Disallow `curl`, `wget`, `nc`, etc.
- Or run in network-isolated container

#### 5. Security Headers
**Priority**: **Medium**
**Fix**: Add to `next.config.ts`:
```typescript
headers: async () => [
  {
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "Content-Security-Policy", value: "default-src 'self'" },
    ],
  },
],
```

### Third-party Scopes Review

| Service | Current Scopes | Least-Privilege | Status |
|---------|----------------|-----------------|--------|
| **Clerk** | Full user auth | ✅ Minimal (auth only) | ✅ OK |
| **Gemini API** | Read/write (API key) | ⚠️ Full access | ⚠️ Review |
| **Brave Search** | Search API | ✅ Minimal | ✅ OK |
| **File Search API** | Upload/search | ⚠️ Full access | ⚠️ Review |

**Recommendations**:
- Use separate API keys per environment
- Rotate keys regularly
- Monitor API usage for anomalies

### Dependency Risk Report

**Top 10 Direct Dependencies** (by risk):

| Package | Version | Known CVEs | Risk | Action |
|---------|---------|------------|------|--------|
| `next` | 16.0.1 | Check npm audit | Medium | Update if CVEs found |
| `react` | 19.2.0 | Check npm audit | Medium | Update if CVEs found |
| `@clerk/nextjs` | 6.35.0 | Check npm audit | Low | Update if CVEs found |
| `@google/genai` | 1.29.0 | Check npm audit | Low | Update if CVEs found |
| `ws` | 8.14.2 | Check npm audit | Medium | Update if CVEs found |
| `zod` | 4.1.12 | Check npm audit | Low | Update if CVEs found |
| `busboy` | 1.6.0 | Check npm audit | Medium | Update if CVEs found |
| `@codemirror/*` | Various | Check npm audit | Low | Update if CVEs found |

**Action**: Run `pnpm audit` and fix high/critical CVEs before GA

---

## 12. TypeScript Quality Gate

### Current tsconfig

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"]
  }
}
```

**Strictness**: ✅ **Enabled** (`strict: true`)

### Strictness Gaps

| Option | Current | Recommended | Notes |
|--------|---------|-------------|-------|
| `strict` | ✅ true | ✅ true | Good |
| `noImplicitAny` | ✅ (via strict) | ✅ | Good |
| `strictNullChecks` | ✅ (via strict) | ✅ | Good |
| `strictFunctionTypes` | ✅ (via strict) | ✅ | Good |
| `noUnusedLocals` | ❌ false | ✅ true | Enable |
| `noUnusedParameters` | ❌ false | ✅ true | Enable |
| `noImplicitReturns` | ❌ false | ✅ true | Enable |
| `noFallthroughCasesInSwitch` | ❌ false | ✅ true | Enable |

### Top Error Classes

**Current**: No TypeScript errors (type-check passes)

**Common Issues** (from code review):
- Some `any` types in tool handlers (should be typed)
- Optional chaining could be improved
- Some type assertions (`as any`) in chat route

### Migration Plan to Stricter Settings

**Phase 1** (Pre-GA):
1. Enable `noUnusedLocals` and `noUnusedParameters`
2. Fix unused variables/parameters
3. Enable `noImplicitReturns`
4. Fix missing return statements

**Phase 2** (Post-GA):
1. Enable `noFallthroughCasesInSwitch`
2. Remove all `any` types
3. Add explicit return types to all functions
4. Enable `noUncheckedIndexedAccess`

### Public Types for API/MCP Contracts

**Current**: Types defined in:
- `lib/types/tool-types.ts` - Tool input/output types
- `lib/types/user-context.ts` - User context
- `lib/llm/types.ts` - LLM message types

**Export Strategy**: ✅ Types exported from `lib/types/`

**Recommendation**: Create `lib/types/api.ts` with all public API types:
```typescript
// lib/types/api.ts
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = StreamEvent;
export type FileSystemListRequest = z.infer<typeof filesystemListSchema>;
// ... etc
```

---

## 13. Test Plan

### Current Test Coverage

**Unit Tests**: ✅ **Partial**
- `tests/tools.test.ts` - Tests for fs.list, fs.move, exec.run, index.scan
- `tests/integration.test.ts` - End-to-end tool execution flow

**Coverage**: ⚠️ **Low** - Only core tools tested, no API route tests

### Minimal Test Suite (Pre-GA)

#### Unit Tests (Hot Paths)
- ✅ `fs.list` - List files
- ✅ `fs.move` - Move file
- ✅ `exec.run` - Execute command
- ✅ `index.scan` - Index filesystem
- ❌ **Add**: `fs.write` - Write file
- ❌ **Add**: `fs.delete` - Delete file
- ❌ **Add**: `brave.search` - Web search (mock API)
- ❌ **Add**: `imagen.generate` - Image generation (mock API)

#### Contract Tests (API Schemas)
- ❌ **Add**: `/api/chat` - Request/response schema validation
- ❌ **Add**: `/api/filesystem/*` - Request/response schema validation
- ❌ **Add**: WebSocket bridge - Message schema validation

#### E2E Tests (Critical Flows)
- ❌ **Add**: Auth flow (login → API call → success)
- ❌ **Add**: Chat flow (send message → receive stream → tool call → response)
- ❌ **Add**: File operations (list → read → write → verify)
- ❌ **Add**: Editor flow (open file → edit → save → verify)

#### Security Tests
- ❌ **Add**: Path traversal attempt (`../../../etc/passwd`)
- ❌ **Add**: Unauthorized access (no auth token)
- ❌ **Add**: Command injection attempt (`; rm -rf /`)
- ❌ **Add**: Rate limiting (spam requests)

### Smoke Script for Fresh Deploy

**Current**: ❌ **Not implemented**

**Recommended Script** (`scripts/smoke-test.sh`):
```bash
#!/bin/bash
set -e

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 Running smoke tests against $BASE_URL"

# 1. Health check (if implemented)
# curl -f "$BASE_URL/api/health" || echo "⚠️ Health check not implemented"

# 2. Auth check (should fail without token)
curl -f "$BASE_URL/api/chat" -X POST -H "Content-Type: application/json" -d '{}' && exit 1 || echo "✅ Auth check passed"

# 3. Static assets
curl -f "$BASE_URL/" > /dev/null && echo "✅ Homepage loads"

echo "✅ Smoke tests passed"
```

**Run**: `./scripts/smoke-test.sh https://production-url.com`

---

## 14. Open Risks & TODOs

### Critical Risks (Pre-GA)

| Risk | Owner | Deadline | Status |
|------|-------|----------|--------|
| **Path Traversal Vulnerability** | Engineering | Pre-GA | ❌ Not started |
| **Command Execution Unsandboxed** | Engineering | Pre-GA | ❌ Not started |
| **No Rate Limiting** | Engineering | Pre-GA | ❌ Not started |
| **No Multi-tenant Isolation** | Engineering | Pre-GA | ⚠️ Partial |
| **WebSocket Not Serverless-Compatible** | Engineering | Pre-GA | ⚠️ Known limitation |

### High-Priority TODOs

| TODO | Owner | Deadline | Notes |
|------|-------|----------|-------|
| **Add path traversal protection** | Engineering | Pre-GA | Enforce WORKSPACE_ROOT boundary |
| **Implement rate limiting** | Engineering | Pre-GA | Use Upstash or similar |
| **Add security headers** | Engineering | Pre-GA | CSP, HSTS, etc. |
| **Sandbox exec.run** | Engineering | Pre-GA | Docker containers or restricted shell |
| **Add comprehensive tests** | Engineering | Pre-GA | Unit + E2E + security |
| **Implement error boundaries** | Frontend | Pre-GA | React error boundaries |
| **Add logging aggregation** | DevOps | Post-GA | CloudWatch/Datadog |
| **Set up monitoring** | DevOps | Post-GA | Prometheus/Grafana |
| **Document API contracts** | Engineering | Pre-GA | OpenAPI/Swagger |
| **Add smoke test script** | Engineering | Pre-GA | Deploy verification |

### Medium-Priority TODOs

| TODO | Owner | Deadline | Notes |
|------|-------|----------|-------|
| **Improve TypeScript strictness** | Engineering | Post-GA | Enable unused vars checks |
| **Add database for index** | Engineering | Post-GA | PostgreSQL instead of JSON |
| **Implement workspace persistence** | Engineering | Post-GA | Redis or database |
| **Add user data deletion** | Engineering | Post-GA | GDPR compliance |
| **Improve accessibility** | Frontend | Post-GA | ARIA labels, screen reader tests |
| **Add i18n support** | Frontend | Post-GA | Multi-language support |

### Low-Priority TODOs

| TODO | Owner | Deadline | Notes |
|------|-------|----------|-------|
| **Add CLI tool** | Engineering | Future | Command-line interface |
| **Mobile app** | Engineering | Future | React Native app |
| **Plugin system** | Engineering | Future | Custom tools/plugins |
| **Team collaboration** | Engineering | Future | Multi-user workspaces |

---

## Summary

### Ready for Launch?
**Status**: ⚠️ **Not Ready** - Critical security issues must be fixed

### Must-Fix Before GA
1. ✅ Path traversal protection
2. ✅ Command execution sandboxing
3. ✅ Rate limiting
4. ✅ Security headers
5. ✅ Comprehensive tests

### Can Defer to Post-GA
- Database migration (currently file-based)
- Advanced monitoring (basic logging sufficient)
- i18n support
- Mobile app

### Estimated Time to Launch
- **Security fixes**: 2-3 days
- **Tests**: 2-3 days
- **Documentation**: 1 day
- **Total**: ~1 week of focused work

---

**End of Blueprint**

