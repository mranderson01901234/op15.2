/**
 * Custom Next.js server with WebSocket support
 * Handles both HTTP requests and WebSocket connections for browser bridge
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Import bridge manager (we'll need to make it work with CommonJS)
// For now, we'll create a simple bridge manager here
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Simple bridge manager for WebSocket connections
const bridges = new Map();
const pendingRequests = new Map();

function generateRequestId(userId) {
  return `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Create WebSocket server for bridge connections only
  const wss = new WebSocketServer({ 
    noServer: true, // Don't auto-handle upgrades, we'll do it manually
  });

  // Handle WebSocket upgrade requests
  // Only handle /api/bridge - don't intercept HMR WebSocket connections
  // Next.js handles HMR internally through its webpack-dev-server
  // When using a custom server, we should NOT intercept /_next/ paths
  // to avoid protocol conflicts and invalid close code errors
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathname = url.pathname;
      
      if (pathname === '/api/bridge') {
        // Handle bridge WebSocket connections
        console.log('WebSocket upgrade request for bridge', { 
          url: request.url,
          pathname,
          origin: request.headers.origin,
        });
        
        try {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        } catch (error) {
          console.error('Error handling bridge WebSocket upgrade', { error: error.message });
          socket.destroy();
        }
      } else if (dev && pathname.startsWith('/_next/')) {
        // Don't intercept Next.js internal WebSocket paths (including HMR)
        // Next.js's webpack-dev-server handles these internally
        // Intercepting causes invalid close code errors (like status code 20729)
        // By not handling these upgrade requests in our custom server,
        // Next.js's webpack-dev-server can handle them properly
        // Note: Next.js's webpack-dev-server runs separately and handles these connections
        return; // Don't handle - let Next.js handle it through its webpack-dev-server
      } else {
        // For unknown WebSocket paths, destroy the connection
        console.debug('WebSocket upgrade request for unknown path, destroying', { pathname });
        socket.destroy();
      }
    } catch (error) {
      // Catch any errors during URL parsing or upgrade handling
      console.error('Error in WebSocket upgrade handler', { error: error.message });
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established', { url: req.url });

    // Extract userId from query params
    let userId;
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      userId = url.searchParams.get('userId');
      console.log('Extracted userId from WebSocket connection', { userId, url: req.url });
    } catch (error) {
      console.error('Failed to parse WebSocket URL', { error, url: req.url });
      ws.close(1008, 'Invalid URL');
      return;
    }

    if (!userId) {
      console.warn('WebSocket connection rejected: missing userId', { url: req.url });
      ws.close(1008, 'Missing userId');
      return;
    }

    console.log('✅ Browser bridge connected successfully', { userId });

    // Store connection
    bridges.set(userId, ws);

    // Set up ping/pong to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.ping();
        } catch (error) {
          console.error('Failed to send ping', { userId, error });
        }
      }
    }, 30000); // Ping every 30 seconds

    // Handle pong responses
    ws.on('pong', () => {
      // Connection is alive
      console.debug('Received pong', { userId });
    });

    // Handle messages from browser
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle ping/pong messages (if sent as JSON)
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        
        // Handle responses to pending requests
        if (message.id && (message.data !== undefined || message.error !== undefined)) {
          const { id, data: responseData, error } = message;
          const pending = pendingRequests.get(id);
          
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(id);

            if (error) {
              pending.reject(new Error(error));
            } else {
              pending.resolve(responseData);
            }
          } else {
            console.warn('Received response for unknown request', { userId, requestId: id });
          }
        } else {
          console.log('Received message from browser', { userId, messageType: message.type || 'unknown' });
        }
      } catch (error) {
        console.error('Failed to parse bridge message', { userId, error, data: data.toString().substring(0, 100) });
      }
    });

    // Handle disconnection
    ws.on('close', (code, reason) => {
      clearInterval(pingInterval);
      console.log('Browser bridge disconnected', { userId, code, reason: reason.toString() });
      bridges.delete(userId);
      // Clean up pending requests
      const requestsToClean = Array.from(pendingRequests.entries())
        .filter(([id]) => id.startsWith(`${userId}-`));
      for (const [id, { timeout }] of requestsToClean) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
      }
    });

    ws.on('error', (error) => {
      clearInterval(pingInterval);
      console.error('Browser bridge error', { userId, error: error.message });
      bridges.delete(userId);
    });

    // Send connection confirmation
    try {
      ws.send(JSON.stringify({ type: 'connected', userId }));
      console.log('Sent connection confirmation', { userId });
    } catch (error) {
      console.error('Failed to send connection confirmation', { userId, error });
    }
  });

  // Expose bridge manager methods globally for use in API routes
  global.bridgeManager = {
    isConnected(userId) {
      const bridge = bridges.get(userId);
      return bridge !== undefined && bridge.readyState === 1; // WebSocket.OPEN
    },

    async requestBrowserOperation(userId, operation, args = {}) {
      const bridge = bridges.get(userId);

      if (!bridge) {
        throw new Error(`Browser bridge not connected for user ${userId}`);
      }

      if (bridge.readyState !== 1) {
        throw new Error(`Browser bridge not ready for user ${userId}`);
      }

      const requestId = generateRequestId(userId);
      const request = {
        id: requestId,
        operation,
        ...args,
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Request timeout for operation ${operation}`));
        }, 30000); // 30 second timeout

        pendingRequests.set(requestId, { resolve, reject, timeout });

        try {
          bridge.send(JSON.stringify(request));
          console.log('Sent bridge request', { userId, requestId, operation });
        } catch (error) {
          pendingRequests.delete(requestId);
          clearTimeout(timeout);
          reject(error);
        }
      });
    },

    connectBridge(userId, ws) {
      // Already handled in connection handler above
      bridges.set(userId, ws);
    },

    disconnectBridge(userId) {
      const bridge = bridges.get(userId);
      if (bridge) {
        bridge.close();
        bridges.delete(userId);
      }
    },

    getConnectedUsers() {
      return Array.from(bridges.keys());
    },
  };

  server.once('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });

  // Handle uncaught exceptions from WebSocket errors
  // This prevents the server from crashing on invalid WebSocket close codes
  process.on('uncaughtException', (error) => {
    // Suppress invalid WebSocket close code errors - these are often harmless
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    const errorName = error.name || '';
    
    // Check if it's a RangeError about invalid WebSocket frames
    if ((errorName === 'RangeError' && errorMessage.includes('Invalid WebSocket frame')) ||
        errorMessage.includes('Invalid WebSocket frame') ||
        errorMessage.includes('WS_ERR_INVALID_CLOSE_CODE') ||
        errorMessage.includes('invalid status code') ||
        errorMessage.includes('invalid close code') ||
        errorCode === 'WS_ERR_INVALID_CLOSE_CODE') {
      // This is expected - HMR clients sometimes send invalid close codes
      // The error is suppressed to prevent server crashes
      console.debug('Suppressed WebSocket error (invalid close code - expected in HMR)', { 
        error: errorMessage,
        code: errorCode,
        name: errorName
      });
      return; // Don't crash the server
    }
    
    // Log other uncaught exceptions but don't crash in dev mode
    console.error('Uncaught exception:', error);
    if (!dev) {
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    // Suppress WebSocket-related unhandled rejections
    if (reason && typeof reason === 'object') {
      const errorMessage = (reason.message || '').toString();
      const errorCode = (reason.code || '').toString();
      
      if (errorMessage.includes('Invalid WebSocket frame') ||
          errorMessage.includes('WS_ERR_INVALID_CLOSE_CODE') ||
          errorMessage.includes('invalid status code') ||
          errorMessage.includes('invalid close code') ||
          errorCode === 'WS_ERR_INVALID_CLOSE_CODE') {
        console.debug('Suppressed unhandled WebSocket rejection', { 
          message: errorMessage,
          code: errorCode
        });
        return;
      }
    }
    console.error('Unhandled promise rejection:', reason);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket bridge available at ws://${hostname}:${port}/api/bridge`);
  });
});

