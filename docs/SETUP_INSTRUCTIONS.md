# Local Environment Setup Instructions

## Overview

This guide explains how to set up and use the local environment bridge feature, which allows the cloud-hosted Next.js application to access your local filesystem without requiring any installation.

## Prerequisites

1. **Node.js 20+** installed
2. **pnpm** package manager
3. **Modern browser** with File System Access API support:
   - Chrome/Edge 86+
   - Opera 72+
   - (Firefox and Safari do not support File System Access API yet)

## Installation

1. Install dependencies:
```bash
pnpm install
```

This will install:
- `ws` - WebSocket library for custom server
- `@types/ws` - TypeScript types for WebSocket

## Running the Application

### Development Mode

The custom server supports both HTTP and WebSocket connections:

```bash
pnpm dev
```

This starts:
- Next.js application on `http://localhost:3000`
- WebSocket bridge on `ws://localhost:3000/api/bridge`

### Production Mode

```bash
pnpm build
pnpm start
```

## Using the Local Environment Bridge

### Step 1: Sign In

1. Open the application in your browser
2. Sign in using Clerk authentication
3. You'll see the sidebar with chat and filesystem tabs

### Step 2: Connect Local Environment

1. Scroll to the bottom of the sidebar
2. Click "Connect Local Environment" button
3. Browser will prompt you to select a directory
4. Choose the directory you want to grant access to
5. Click "Select Folder"

### Step 3: Verify Connection

Once connected, you'll see:
- ✅ Green indicator showing "Local Environment Connected"
- Connection status in the sidebar

### Step 4: Use Features

Now you can:
- **File Operations**: Ask the LLM to list, read, write, or delete files
- **Command Execution**: Ask the LLM to run commands (e.g., "npm install")
- **File Editing**: Open and edit files through the chat interface

## How It Works

### File Operations Flow

```
User: "List files in my project"
  ↓
Browser → Cloud Server (via HTTP)
  ↓
Cloud Server → LLM API
  ↓
LLM → Cloud Server: { tool_call: "fs.list" }
  ↓
Cloud Server → Browser Bridge (via WebSocket)
  ↓
Browser → File System API
  ↓
Browser → Cloud Server: { entries: [...] }
  ↓
Cloud Server → LLM: Tool result
  ↓
LLM → Cloud Server: "I found 10 files..."
  ↓
Cloud Server → Browser: Stream response
```

### Command Execution Flow

```
User: "Run npm install"
  ↓
Browser → Cloud Server
  ↓
Cloud Server → LLM API
  ↓
LLM → Cloud Server: { tool_call: "exec.run", command: "npm install" }
  ↓
Cloud Server → Browser Bridge: Request workspace sync
  ↓
Browser → Collects all workspace files
  ↓
Browser → Cloud Server: POST /api/workspace/sync { files: [...] }
  ↓
Cloud Server → Creates temp workspace with files
  ↓
Cloud Server → Executes "npm install" in temp workspace
  ↓
Cloud Server → Streams output back to browser
  ↓
Cloud Server → LLM: Tool result
  ↓
LLM → Cloud Server: "npm install completed successfully"
  ↓
Cloud Server → Browser: Stream response
```

## Troubleshooting

### WebSocket Connection Failed

**Problem**: "Failed to connect local environment bridge"

**Solutions**:
1. Make sure you're using the custom server (`pnpm dev` not `pnpm dev:next`)
2. Check browser console for WebSocket errors
3. Verify firewall isn't blocking WebSocket connections
4. Try refreshing the page and reconnecting

### File System Access Denied

**Problem**: Browser doesn't prompt for directory selection

**Solutions**:
1. Make sure you're using a supported browser (Chrome/Edge/Opera)
2. Check browser permissions for file system access
3. Try clearing browser cache and cookies
4. Make sure you're accessing via `http://localhost:3000` (not file://)

### Workspace Sync Failed

**Problem**: "Workspace not synced" error when running commands

**Solutions**:
1. Make sure local environment is connected
2. Check browser console for sync errors
3. Verify you have read permissions for all files
4. Try disconnecting and reconnecting

### Commands Not Executing

**Problem**: Commands fail or timeout

**Solutions**:
1. Check that workspace sync completed successfully
2. Verify command is valid for the workspace
3. Check server logs for execution errors
4. Make sure temp workspace directory is writable (`/tmp/workspaces/`)

## Security Considerations

1. **File Access**: Only the directory you select is accessible
2. **Authentication**: All connections require Clerk authentication
3. **Isolation**: Each user has separate WebSocket connection
4. **Temporary Workspaces**: Exec.run workspaces are cleaned up after use
5. **Audit Logging**: All operations are logged for security

## Browser Compatibility

| Browser | File System Access API | Status |
|---------|----------------------|--------|
| Chrome 86+ | ✅ Supported | Recommended |
| Edge 86+ | ✅ Supported | Recommended |
| Opera 72+ | ✅ Supported | Supported |
| Firefox | ❌ Not Supported | Not Available |
| Safari | ❌ Not Supported | Not Available |

## Next Steps

- See `docs/LOCAL_ENV_ARCHITECTURE.md` for architecture details
- See `docs/WEBSOCKET_SETUP.md` for WebSocket configuration options
- Check server logs for debugging information

