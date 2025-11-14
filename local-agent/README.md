# Local Agent for op15

A Node.js agent that runs on your local machine and provides full filesystem access to the op15 cloud server without browser restrictions.

## Features

- ✅ **Full filesystem access** - No browser restrictions (can access `/home`, `/etc`, etc.)
- ✅ **Automatic reconnection** - Reconnects if connection drops
- ✅ **WebSocket connection** - Real-time communication with cloud server
- ✅ **All file operations** - List, read, write, delete, move files
- ✅ **Command execution** - Run shell commands locally

## Installation

### Option 1: Using npx (Recommended)

```bash
npx @op15/local-agent <server-url> <user-id>
```

### Option 2: Install globally

```bash
npm install -g @op15/local-agent
op15-agent <server-url> <user-id>
```

### Option 3: Build from source

```bash
cd local-agent
pnpm install
pnpm build
node dist/index.js <server-url> <user-id>
```

## Usage

1. Get your user ID from the op15 web app (after signing in)
2. Run the agent:

```bash
op15-agent https://your-app.up.railway.app user_123abc
```

The agent will:
- Connect to your cloud server
- Provide full filesystem access
- Automatically reconnect if disconnected
- Run until you press Ctrl+C

## How It Works

```
Cloud Server (Railway)
  ↓ WebSocket
Local Agent (runs on your machine)
  ↓ Node.js fs module (full access)
Your Local Filesystem
```

The agent connects via WebSocket and handles file operations locally, bypassing browser security restrictions.

## Advantages Over Browser Bridge

| Feature | Browser Bridge | Local Agent |
|---------|---------------|------------|
| System directories | ❌ Blocked (`/home`, `/etc`) | ✅ Full access |
| Installation | ✅ None (browser only) | ⚠️ Requires Node.js |
| Filesystem access | ⚠️ Limited | ✅ Full |
| Performance | ⚠️ Browser overhead | ✅ Direct |

## Troubleshooting

### Connection fails
- Check that your server URL is correct
- Ensure WebSocket connections are enabled on your server
- Verify your user ID is correct

### Permission errors
- The agent runs with your user's permissions
- Ensure you have read/write access to directories you want to access

### Agent disconnects
- The agent automatically reconnects
- Check your internet connection
- Verify the server is running

## Security

- The agent only connects to servers you specify
- All operations use your local user permissions
- No data is stored or transmitted except during active operations
- WebSocket connection is encrypted (wss://)

