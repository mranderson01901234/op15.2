# WebSocket Bridge Setup

## Overview

The local environment bridge uses WebSocket connections between the browser and cloud server. Next.js doesn't natively support WebSocket upgrades, so you'll need to use one of the following approaches:

## Option 1: Custom Next.js Server (Recommended for Development)

Create a custom server that handles both HTTP and WebSocket connections:

```typescript
// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { getBridgeManager } = require('./lib/infrastructure/bridge-manager');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      getBridgeManager().connectBridge(userId, ws);
    } else {
      ws.close(1008, 'Missing userId');
    }
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

Update `package.json`:
```json
{
  "scripts": {
    "dev": "node server.js",
    "start": "NODE_ENV=production node server.js"
  },
  "dependencies": {
    "ws": "^8.14.2"
  }
}
```

## Option 2: Server-Sent Events (SSE) - Simpler Alternative

Use SSE instead of WebSocket for one-way communication:

```typescript
// app/api/bridge/route.ts
export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      // Handle SSE connection
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: connected\n\n'));
      
      // Store controller for sending messages
      bridgeManager.setSSEController(userId, controller);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

## Option 3: WebSocket Service (Production)

Use a managed WebSocket service:
- **Pusher**: `npm install pusher`
- **Ably**: `npm install ably`
- **Socket.io**: `npm install socket.io`

## Option 4: Vercel/Netlify Edge Functions

For serverless deployments, use edge functions with WebSocket support:
- Vercel: Use Edge Runtime with WebSocket proxy
- Netlify: Use WebSocket functions

## Current Implementation

The current implementation in `app/api/bridge/route.ts` returns a 426 status indicating WebSocket upgrade is required. You'll need to implement one of the above options based on your deployment target.

## Testing

1. Start your custom server: `npm run dev`
2. Connect browser bridge from UI
3. Check WebSocket connection in browser DevTools → Network → WS
4. Test file operations through the bridge

