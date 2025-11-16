# WebSocket Test Server

This is a standalone WebSocket server used to test agent connectivity **completely separate from Next.js**. This helps prove whether WebSocket issues are in the Next.js integration or the agent itself.

## Usage

### 1. Start the test server

```bash
# Easiest way - using npm script
pnpm run test:ws

# Or run directly
node ws-test-server.js

# Or using ts-node (if installed)
ts-node ws-test-server.ts

# Or use tsx (if installed)
tsx ws-test-server.ts
```

The server will listen on `ws://localhost:4000/api/bridge`

### 2. Test with the agent

Point your agent to the test server:

```bash
# Run the agent with test server URL
node local-agent/index.ts http://localhost:4000 <your-user-id>
```

The agent will automatically connect to `/api/bridge` when you pass `http://localhost:4000` as the server URL.

### 3. Expected behavior

If the agent:
- ✅ Connects once
- ✅ Sends metadata
- ✅ Receives ack
- ✅ Stays connected for minutes

Then the bug is **100% in your Next.js / custom server.js integration**, not in the agent, not in the OS, not in "mystery 1006."

If it still 1006's in this setup, then we re-target to the agent, but it likely won't.

## What this proves

- **Stable connection** = Next.js integration is the problem
- **Still 1006** = Agent or OS-level issue (unlikely)

## Next steps

Once you've proven the standalone server is stable:

1. Fix your Next.js/server.js integration OR
2. Use a separate daemon for WebSocket + local tools (recommended)
3. Let Next.js handle only UI + HTTP APIs

