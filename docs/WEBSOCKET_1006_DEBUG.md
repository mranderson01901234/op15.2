# WebSocket 1006 Error Debugging

## Issue

Agent connects successfully, sends metadata, receives acknowledgment, but then connection closes with code 1006 (abnormal closure).

## Evidence

- ✅ Standalone test server works perfectly (no 1006 errors)
- ❌ Next.js server closes connection after metadata acknowledgment
- Pattern: Connect → Metadata → Ack → **1006 close**

## Possible Causes

1. **Next.js Dev Mode Interference**
   - Dev mode may interfere with WebSocket connections
   - Hot module reloading could be closing connections
   - Solution: Test in production mode

2. **HTTP Server Upgrade Handling**
   - Upgrade request might not be handled correctly
   - Next.js might be intercepting the connection
   - Solution: Verify upgrade handler is correct

3. **Error in Message Handler**
   - Unhandled error might be closing connection
   - Solution: Check server logs for errors

4. **Ping/Pong Mismatch**
   - Server sends WebSocket pings, agent sends JSON pings
   - Protocol mismatch could cause closure
   - Solution: Align ping/pong mechanism

## Debugging Steps

### 1. Check Server Logs

When agent connects, check server console for:
- `[bridge] SOCKET CLOSED` - shows when/why connection closed
- `[bridge] SOCKET ERROR` - shows any errors
- `[bridge] EXPLICIT CLOSE CALLED` - shows if something explicitly closes

### 2. Test in Production Mode

```bash
# Build Next.js app
pnpm build

# Run in production mode
NODE_ENV=production node server.js

# Test agent connection
node local-agent/dist/index.js http://localhost:3000 user_123
```

### 3. Check for Next.js Interference

The issue might be that Next.js dev server is interfering. Try:

```bash
# Stop dev server
# Run only custom server
node server.js
```

### 4. Compare with Standalone Server

The standalone server works, so compare:

**Standalone server:**
- Simple HTTP server
- Direct WebSocket upgrade handling
- No Next.js middleware

**Next.js server:**
- Next.js app + custom server
- Upgrade handler must avoid Next.js paths
- Potential middleware interference

## Recommended Fix

Based on the architecture review, the best solution is:

1. **Use Separate Daemon** (already implemented!)
   - Agent runs as separate process
   - HTTP API on port 4001
   - WebSocket connection optional

2. **Fix Next.js Integration** (if needed)
   - Ensure upgrade handler doesn't conflict with Next.js
   - Test in production mode
   - Consider running WebSocket on separate port

3. **Alternative: Use HTTP API Only**
   - Agent exposes HTTP API (already done)
   - Cloud server calls HTTP API instead of WebSocket
   - More reliable, easier to debug

## Immediate Workaround

Since the agent already has HTTP API, you can:

1. **Use HTTP API for operations** instead of WebSocket
2. **Keep WebSocket for status/notifications only**
3. **Use standalone daemon pattern** (recommended)

## Next Steps

1. Check server logs when connection closes
2. Test in production mode (`NODE_ENV=production`)
3. Consider using HTTP API instead of WebSocket for operations
4. If WebSocket is required, investigate Next.js dev mode interference

