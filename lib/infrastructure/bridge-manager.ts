/**
 * Bridge Manager - Manages WebSocket connections to local agents
 * Handles routing tool calls from cloud server to local Node.js agents
 * Note: Browser bridge support has been removed - only agents are supported
 */

import { logger } from '@/lib/utils/logger';
import type { WebSocket as WSWebSocket } from 'ws';

// Use Node.js WebSocket type from 'ws' package
type NodeWebSocket = WSWebSocket;

export interface BridgeRequest {
  id: string;
  operation: string;
  [key: string]: unknown;
}

export interface BridgeResponse {
  id: string;
  data?: unknown;
  error?: string;
}

export class BridgeManager {
  private bridges = new Map<string, NodeWebSocket>();
  private pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private requestTimeout = 30000; // 30 seconds

  /**
   * Connect an agent WebSocket (legacy method - agents are handled in server.js)
   */
  connectBridge(userId: string, ws: NodeWebSocket): void {
    logger.info('Agent connected (via legacy method)', { userId });

    // Store connection
    this.bridges.set(userId, ws);

    // Handle messages from browser
    ws.on('message', async (data: Buffer) => {
      try {
        const response: BridgeResponse = JSON.parse(data.toString());
        await this.handleBridgeResponse(userId, response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to parse bridge response', error instanceof Error ? error : undefined, { 
          error: errorMessage,
          userId,
        });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      logger.info('Agent disconnected (via legacy method)', { userId });
      this.bridges.delete(userId);
      // Clean up pending requests
      this.cleanupPendingRequests(userId);
    });

    ws.on('error', (error) => {
      logger.error('Agent error (via legacy method)', error instanceof Error ? error : undefined, { userId });
      this.bridges.delete(userId);
      this.cleanupPendingRequests(userId);
    });
  }

  /**
   * Check if user has an active agent connection
   * Returns true if EITHER WebSocket is connected OR HTTP API is available
   * HTTP API works even if WebSocket closes (e.g., with 1006 error)
   * 
   * @deprecated Use getConnectionStatus() from connection-status.ts for more detailed status
   */
  isConnected(userId: string): boolean {
    // Check both the bridge-manager connections AND the server.js agents Map
    // server.js exposes its agents via global.serverAgents
    const bridge = this.bridges.get(userId);
    const isBridgeConnected = bridge !== undefined && bridge.readyState === 1; // WebSocket.OPEN
    
    // Also check server.js agents (the actual WebSocket server)
    if (typeof global !== 'undefined' && (global as any).serverAgents) {
      const serverAgent = (global as any).serverAgents.get(userId);
      if (serverAgent && serverAgent.readyState === 1) {
        return true;
      }
    }
    
    // If WebSocket is not connected, check HTTP API availability
    // HTTP API works even if WebSocket closes (e.g., 1006 error in Next.js dev mode)
    if (!isBridgeConnected) {
      const httpPort = this.getAgentHttpPort(userId);
      if (httpPort) {
        // HTTP API is available if port exists in metadata
        // The agent's HTTP server runs independently of WebSocket
        return true;
      }
    }
    
    return isBridgeConnected;
  }

  /**
   * Async version that checks HTTP health endpoint
   * Use this for more accurate connection status
   */
  async isConnectedAsync(userId: string): Promise<boolean> {
    const { getConnectionStatus } = await import('./connection-status');
    const info = await getConnectionStatus(userId);
    return info.status !== "none";
  }

  /**
   * Request operation from agent
   * Prefers HTTP API if available (browser-side only), falls back to WebSocket
   * Note: HTTP API only works from browser/client-side. Server-side code must use WebSocket.
   */
  async requestBrowserOperation(
    userId: string,
    operation: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    // HTTP API only works from browser/client-side (can reach user's localhost)
    // Server-side code cannot reach user's localhost, so skip HTTP API in production
    const isServerSide = typeof window === 'undefined';
    
    // Try HTTP API first (only from browser/client-side)
    if (!isServerSide) {
      const httpPort = this.getAgentHttpPort(userId);
      if (httpPort) {
        try {
          const { AgentHttpClient } = await import('./agent-http-client');
          const client = new AgentHttpClient(httpPort);
          return await client.executeOperation(operation as any, args);
        } catch (error) {
          logger.warn('HTTP API request failed, falling back to WebSocket', {
            userId,
            operation,
            error: error instanceof Error ? error.message : String(error),
          });
          // Fall through to WebSocket
        }
      }
    }

    // Fall back to WebSocket
    let bridge = this.bridges.get(userId);
    
    // If not in bridge-manager, check server.js agents
    if (!bridge && typeof global !== 'undefined' && (global as any).serverAgents) {
      bridge = (global as any).serverAgents.get(userId);
    }
    
    if (!bridge) {
      throw new Error(`Agent not connected for user ${userId}`);
    }

    if (bridge.readyState !== 1) { // WebSocket.OPEN
      throw new Error(`Agent not ready for user ${userId}`);
    }

    const requestId = this.generateRequestId(userId);
    const request: BridgeRequest = {
      id: requestId,
      operation,
      ...args,
    };

    return new Promise<unknown>((resolve, reject) => {
      // Store pending request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout for operation ${operation}`));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send request via WebSocket
      try {
        bridge.send(JSON.stringify(request));
        logger.debug('Sent bridge request via WebSocket', { userId, requestId, operation });
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Failed to send request'));
      }
    });
  }

  /**
   * Get agent HTTP port from metadata, or default to 4001
   * This allows HTTP API to work even if metadata isn't registered (e.g., WebSocket closed)
   */
  private getAgentHttpPort(userId: string): number | null {
    if (typeof global !== 'undefined' && (global as any).agentMetadata) {
      const metadata = (global as any).agentMetadata.get(userId);
      if (metadata && metadata.httpPort) {
        return metadata.httpPort;
      }
    }
    // Default to 4001 if metadata not available (HTTP-only connection)
    // This allows tools to work even if WebSocket never connected
    return 4001;
  }

  /**
   * Handle response from agent
   */
  private async handleBridgeResponse(userId: string, response: BridgeResponse): Promise<void> {
    const { id, data, error } = response;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      logger.warn('Received response for unknown request', { userId, requestId: id });
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }

  /**
   * Clean up pending requests for a user
   */
  private cleanupPendingRequests(userId: string): void {
    const requestsToClean = Array.from(this.pendingRequests.entries())
      .filter(([id]) => id.startsWith(`${userId}-`));

    for (const [id, { timeout }] of requestsToClean) {
      clearTimeout(timeout);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(userId: string): string {
    return `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Disconnect user agent
   */
  disconnectBridge(userId: string): void {
    const bridge = this.bridges.get(userId);
    if (bridge) {
      bridge.close();
      this.bridges.delete(userId);
      this.cleanupPendingRequests(userId);
    }
  }

  /**
   * Get all connected users
   */
  getConnectedUsers(): string[] {
    return Array.from(this.bridges.keys());
  }
}

// Singleton instance
let bridgeManagerInstance: BridgeManager | null = null;

export function getBridgeManager(): BridgeManager {
  // In custom server mode, use global bridge manager from server.js
  try {
    if (typeof global !== 'undefined' && (global as any).bridgeManager) {
      const globalBridgeManager = (global as any).bridgeManager;
      // Create a wrapper that matches BridgeManager interface
      return {
        isConnected: (userId: string) => globalBridgeManager.isConnected(userId),
        requestBrowserOperation: (userId: string, operation: string, args?: Record<string, unknown>) => 
          globalBridgeManager.requestBrowserOperation(userId, operation, args),
        connectBridge: (userId: string, ws: NodeWebSocket) => globalBridgeManager.connectBridge(userId, ws),
        disconnectBridge: (userId: string) => globalBridgeManager.disconnectBridge(userId),
        getConnectedUsers: () => globalBridgeManager.getConnectedUsers(),
      } as BridgeManager;
    }
  } catch (error) {
    logger.warn('Failed to access global bridge manager, using local instance', { error: error instanceof Error ? error.message : String(error) });
  }

  // Otherwise, create new instance
  if (!bridgeManagerInstance) {
    bridgeManagerInstance = new BridgeManager();
  }
  return bridgeManagerInstance;
}

