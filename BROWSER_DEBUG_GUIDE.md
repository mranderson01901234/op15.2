# Browser Integration Debug Guide

## Console Logging Added

I've added comprehensive console logging to help debug the browser integration:

### BrowserPanel Component Logs
- `[BrowserPanel] Connecting to WebSocket:` - Shows WebSocket URL being used
- `[BrowserPanel] WebSocket connected successfully` - Connection established
- `[BrowserPanel] Received message:` - Shows message type and data info
- `[BrowserPanel] Frame rendered:` - Confirms frame was drawn to canvas
- `[BrowserPanel] URL updated:` - URL changes from browser service
- `[BrowserPanel] Navigation state:` - Back/forward button states
- `[BrowserPanel] WebSocket error:` - Connection errors
- `[BrowserPanel] WebSocket closed:` - Connection closed with code/reason

### Workspace Context Logs
- `[WorkspaceContext] Opening browser:` - Browser open initiated
- `[WorkspaceContext] Browser session created:` - Session ID received
- `[WorkspaceContext] Navigating to URL:` - Navigation request sent
- `[WorkspaceContext] Navigation successful` - Navigation completed
- `[WorkspaceContext] Error opening browser:` - Any errors during setup

## How to Check Logs

### Browser Console (Client-Side)
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for `[BrowserPanel]` and `[WorkspaceContext]` prefixed logs
4. Check for any red error messages

### Browser Service Logs (Server-Side)
The browser service should output logs to the terminal where it's running:
- Session creation: `POST /sessions`
- Navigation: `Navigate: <url>`
- WebSocket connections: `WebSocket connection established`
- Errors: `Error creating session:`, `Error navigating:`, etc.

### Next.js Server Logs
Check the terminal where `pnpm dev` is running for:
- API route calls: `POST /api/browser/sessions`, etc.
- Proxy errors: Any fetch failures to browser service

## Common Issues to Check

### 1. WebSocket Connection Fails
**Symptoms:**
- Red connection indicator
- `[BrowserPanel] WebSocket error:` in console
- `[BrowserPanel] WebSocket closed:` with error code

**Check:**
- Is browser service running on port 7071?
- Is `NEXT_PUBLIC_BROWSER_SERVICE_URL` set correctly?
- Check browser service logs for connection attempts

### 2. No Frames Received
**Symptoms:**
- Green connection indicator but blank canvas
- No `[BrowserPanel] Frame rendered:` logs
- `[BrowserPanel] Received message:` shows no frame messages

**Check:**
- Browser service WebSocket handler is working
- Session exists in browser service
- Check browser service logs for frame sending errors

### 3. Session Creation Fails
**Symptoms:**
- `[WorkspaceContext] Session creation failed:` in console
- Browser panel shows error

**Check:**
- Browser service is running
- Browser service has Playwright/Chromium installed
- Check browser service logs for session creation errors

### 4. Navigation Fails
**Symptoms:**
- `[WorkspaceContext] Navigation failed:` warning
- URL doesn't change in browser panel

**Check:**
- Session ID is valid
- URL is properly formatted
- Browser service logs show navigation errors

## Debugging Steps

1. **Check Browser Console First**
   - Open DevTools → Console
   - Look for error messages
   - Check WebSocket connection status

2. **Check Browser Service Logs**
   - Look at terminal where browser service is running
   - Check for errors or warnings
   - Verify WebSocket connections are being established

3. **Check Network Tab**
   - Open DevTools → Network
   - Filter by WS (WebSocket)
   - Check WebSocket connection status
   - Look for failed API requests to `/api/browser/*`

4. **Verify Environment Variables**
   - Check `.env.local` exists
   - Verify `BROWSER_SERVICE_URL` and `NEXT_PUBLIC_BROWSER_SERVICE_URL`
   - Restart Next.js dev server after changing env vars

5. **Test Browser Service Directly**
   ```bash
   # Test health endpoint
   curl http://localhost:7071/health
   
   # Test session creation
   curl -X POST http://localhost:7071/sessions \
     -H "Content-Type: application/json" \
     -d '{"viewport":{"w":1280,"h":800}}'
   ```

## Expected Log Flow

### Successful Connection:
```
[WorkspaceContext] Opening browser: https://example.com
[WorkspaceContext] Browser session created: abc123
[WorkspaceContext] Navigating to URL: https://example.com
[WorkspaceContext] Navigation successful
[BrowserPanel] Connecting to WebSocket: ws://localhost:7071/rtc?sid=abc123
[BrowserPanel] WebSocket connected successfully
[BrowserPanel] Received message: frame { hasFrame: true, hasData: true, dataLength: 12345 }
[BrowserPanel] Frame rendered: 1280 x 800
```

### Failed Connection:
```
[WorkspaceContext] Opening browser: https://example.com
[WorkspaceContext] Session creation failed: 500 { error: "..." }
[WorkspaceContext] Error opening browser: Error: Failed to create browser session
```

## Next Steps

After checking logs, share:
1. Browser console errors (if any)
2. Browser service terminal output
3. Network tab WebSocket status
4. Any specific error messages

This will help identify the exact issue!



