# Local Environment Architecture

## Overview

This document describes the architecture for connecting users' local environments to the cloud-hosted Next.js application without requiring any installation.

## Architecture Flow

```
User Browser (UI)
  ↓ HTTP/WebSocket
Cloud Next.js Server (your-app.com)
  ↓ API calls
LLM (Gemini API - Google's servers)
  ↓ Tool calls (function calling)
Cloud Next.js Server (executes tools)
  ↓ Needs local file access
User Browser (File System Access API bridge)
  ↓ Direct access
User's Local Machine
```

## Components

### 1. Browser Bridge (`lib/browser/local-env-bridge.ts`)

- Uses File System Access API to access local files
- Connects to cloud server via WebSocket
- Handles file operations (list, read, write, delete, move)
- Syncs workspace for exec.run operations

### 2. Bridge Manager (`lib/infrastructure/bridge-manager.ts`)

- Manages WebSocket connections per user
- Routes tool calls from cloud server to browser
- Handles request/response matching
- Tracks connection status

### 3. Tool Handlers (Updated)

- `lib/tools/fs.ts`: File operations use browser bridge when connected
- `lib/tools/exec.ts`: Command execution syncs workspace to cloud temp directory

### 4. API Routes

- `/api/users/[userId]/local-env`: Connect local environment
- `/api/bridge`: WebSocket endpoint for browser connections
- `/api/workspace/sync`: Sync workspace files for exec.run
- `/api/workspace/metadata`: Store workspace metadata

### 5. UI Component (`components/local-env/local-env-connector.tsx`)

- One-click connection button
- Shows connection status
- Handles file system access request

## User Flow

1. User logs in via Clerk
2. User clicks "Connect Local Environment"
3. Browser requests file system access (one-click authorization)
4. Browser connects WebSocket to cloud server
5. Cloud server can now access user's local files through browser bridge
6. LLM tool calls are routed through browser bridge to local filesystem

## File Operations

### With Browser Bridge Connected

- `fs.list`: Browser → File System API → Cloud Server
- `fs.read`: Browser → File System API → Cloud Server
- `fs.write`: Cloud Server → Browser → File System API
- `fs.delete`: Cloud Server → Browser → File System API
- `fs.move`: Cloud Server → Browser → File System API

### Without Browser Bridge

- Falls back to server-side file operations (if workspace synced)
- Or returns error if no access

## Command Execution (exec.run)

1. LLM calls `exec.run` with command
2. Cloud server requests browser to sync workspace
3. Browser collects all workspace files
4. Browser sends files to `/api/workspace/sync`
5. Cloud server creates temp workspace with files
6. Cloud server executes command in temp workspace
7. Cloud server streams output back to browser
8. Cloud server cleans up temp workspace

## Security

- Authentication: Clerk verifies user identity
- Authorization: User must explicitly grant file system access
- Isolation: Each user has separate WebSocket connection
- Validation: All paths validated before operations
- Audit: All operations logged

## WebSocket Setup

See `docs/WEBSOCKET_SETUP.md` for WebSocket implementation options.

## Future Enhancements

- Auto-reconnect on disconnect
- Workspace caching for faster exec.run
- Incremental sync (only changed files)
- Multiple workspace support
- Workspace sharing between users

