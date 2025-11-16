/**
 * Custom Next.js server with WebSocket support
 * Handles both HTTP requests and WebSocket connections for local agents
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Agent connection manager for WebSocket connections
const agents = new Map(); // Local Node.js agents - full filesystem access
const pendingRequests = new Map();

// Expose agents Map globally so BridgeManager can access it
global.serverAgents = agents;

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

  // Create WebSocket server for agent connections
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
        // Handle agent WebSocket connections
        console.log('WebSocket upgrade request for agent', { 
          url: request.url,
          pathname,
          origin: request.headers.origin,
        });
        
        try {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        } catch (error) {
          console.error('Error handling agent WebSocket upgrade', { error: error.message });
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

    // Extract userId and connection type from query params
    let userId;
    let connectionType;
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      userId = url.searchParams.get('userId');
      connectionType = url.searchParams.get('type') || 'agent'; // Only 'agent' is supported
      console.log('Extracted connection info', { userId, connectionType, url: req.url });
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

    // Only accept agent connections
    if (connectionType !== 'agent') {
      console.warn('WebSocket connection rejected: only agent connections are supported', { userId, connectionType });
      ws.close(1008, 'Only agent connections are supported');
      return;
    }

    console.log(`✅ Local agent connected successfully`, { userId });

    // Store agent connection
    agents.set(userId, ws);

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
        console.log('[bridge] incoming message, size:', data.length);
        const message = JSON.parse(data.toString());
        console.log('[bridge] parsed message type:', message.type);
        
        // Handle ping/pong messages (if sent as JSON)
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          console.log('[bridge] responded to ping');
          return;
        }
        
        // Handle agent metadata (home directory, platform info, filesystem index)
        if (message.type === 'agent-metadata') {
          console.log('[bridge] processing agent-metadata');
          console.log('Received agent metadata', { 
            userId, 
            homeDirectory: message.homeDirectory,
            indexedDirectories: message.filesystemIndex?.mainDirectories?.length || 0,
            indexedPaths: message.filesystemIndex?.indexedPaths?.length || 0,
          });
          
          // Store agent metadata globally for API routes to access
          if (!global.agentMetadata) {
            global.agentMetadata = new Map();
          }
          const metadata = {
            homeDirectory: message.homeDirectory,
            platform: message.platform,
            filesystemIndex: message.filesystemIndex || null,
            httpPort: message.httpPort || 4001, // Store HTTP API port
          };
          global.agentMetadata.set(userId, metadata);
          console.log('[bridge] ✅ Metadata stored (persists even if WebSocket closes)', { 
            userId, 
            httpPort: metadata.httpPort,
            hasMetadata: true 
          });
          
          // Store filesystem index separately for quick access
          if (message.filesystemIndex) {
            if (!global.filesystemIndexes) {
              global.filesystemIndexes = new Map();
            }
            global.filesystemIndexes.set(userId, {
              mainDirectories: message.filesystemIndex.mainDirectories,
              indexedPaths: new Set(message.filesystemIndex.indexedPaths), // Use Set for fast lookup
              indexedAt: message.filesystemIndex.indexedAt,
            });
            console.log(`📁 Cached filesystem index for user ${userId}: ${message.filesystemIndex.indexedPaths.length} paths`);
          }
          
          console.log('[bridge] agent-metadata processed successfully, ws.readyState:', ws.readyState, 'ws.OPEN:', ws.OPEN);
          console.log('[bridge] NOT closing socket, handler complete');
          
          // TEST: Send immediate acknowledgment to keep connection active
          try {
            ws.send(JSON.stringify({ type: 'metadata-ack', received: true }));
            console.log('[bridge] Sent metadata-ack to agent');
          } catch (err) {
            console.error('[bridge] Failed to send metadata-ack:', err);
          }
          
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
          console.log('[bridge] Received other message', { userId, messageType: message.type || 'unknown' });
        }
      } catch (error) {
        console.error('[bridge] MESSAGE HANDLER ERROR:', { userId, error: error.message, stack: error.stack, dataPreview: data.toString().substring(0, 100) });
        // DO NOT close the socket here - let it stay alive to debug
      }
    });

    // Handle disconnection
    ws.on('close', (code, reason) => {
      clearInterval(pingInterval);
      const stackTrace = new Error().stack;
      console.log('[bridge] SOCKET CLOSED', { 
        userId, 
        code, 
        reason: reason.toString(), 
        wasConnected: agents.has(userId),
        readyState: ws.readyState,
        stackTrace: stackTrace?.split('\n').slice(0, 5).join('\n')
      });
      agents.delete(userId);
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
      console.error('[bridge] SOCKET ERROR:', { 
        userId, 
        error: error.message, 
        stack: error.stack,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall
      });
      agents.delete(userId);
    });
    
    // Monitor for unexpected closes
    const originalClose = ws.close.bind(ws);
    ws.close = function(...args) {
      console.log('[bridge] EXPLICIT CLOSE CALLED', { userId, args, stackTrace: new Error().stack?.split('\n').slice(0, 10).join('\n') });
      return originalClose(...args);
    };

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
      // Check if agent is connected
      const agent = agents.get(userId);
      return agent !== undefined && agent.readyState === 1; // WebSocket.OPEN
    },

    async requestBrowserOperation(userId, operation, args = {}) {
      // Server-to-agent communication uses WebSocket (agent connects TO server)
      // HTTP API is only for browser-to-agent communication (client-side)
      // In production, server cannot reach client's localhost, so we use WebSocket only
      
      const agent = agents.get(userId);

      if (!agent) {
        // Check if we have metadata (agent might be HTTP-only, not WebSocket connected)
        const metadata = global.agentMetadata?.get(userId);
        if (metadata?.httpPort) {
          // Agent exists but WebSocket not connected
          // This is OK - agent can still work via HTTP from browser
          // But server-side operations need WebSocket
          throw new Error(
            `Agent WebSocket not connected for user ${userId}. ` +
            `The agent is running (HTTP API available on port ${metadata.httpPort}), ` +
            `but WebSocket connection is required for server-side operations. ` +
            `Please ensure the agent is connected via WebSocket.`
          );
        }
        throw new Error(
          `No agent connection available for user ${userId}. ` +
          `Please ensure your local agent is running and connected.`
        );
      }

      if (agent.readyState !== 1) {
        const readyStateNames = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED'
        };
        throw new Error(
          `Agent WebSocket not ready for user ${userId} (state: ${readyStateNames[agent.readyState] || agent.readyState}). ` +
          `Please ensure the agent is connected and try again.`
        );
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
          agent.send(JSON.stringify(request));
          console.log(`Sent agent request`, { userId, requestId, operation });
        } catch (error) {
          pendingRequests.delete(requestId);
          clearTimeout(timeout);
          reject(error);
        }
      });
    },

    disconnectBridge(userId) {
      // Disconnect agent
      const agent = agents.get(userId);
      if (agent) {
        agent.close();
        agents.delete(userId);
      }
    },

    getConnectedUsers() {
      // Return all users with agent connections
      return Array.from(agents.keys());
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
    console.log(`> WebSocket agent endpoint available at ws://${hostname}:${port}/api/bridge`);
  });
});

