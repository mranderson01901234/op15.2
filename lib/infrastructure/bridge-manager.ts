/**
 * Bridge Manager - Manages WebSocket connections to user browsers
 * Handles routing tool calls from cloud server to browser File System API
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
   * Connect a browser bridge WebSocket
   */
  connectBridge(userId: string, ws: NodeWebSocket): void {
    logger.info('Browser bridge connected', { userId });

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
      logger.info('Browser bridge disconnected', { userId });
      this.bridges.delete(userId);
      // Clean up pending requests
      this.cleanupPendingRequests(userId);
    });

    ws.on('error', (error) => {
      logger.error('Browser bridge error', error instanceof Error ? error : undefined, { userId });
      this.bridges.delete(userId);
      this.cleanupPendingRequests(userId);
    });
  }

  /**
   * Check if user has an active bridge connection
   */
  isConnected(userId: string): boolean {
    const bridge = this.bridges.get(userId);
    return bridge !== undefined && bridge.readyState === 1; // WebSocket.OPEN
  }

  /**
   * Request operation from browser bridge
   */
  async requestBrowserOperation(
    userId: string,
    operation: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    const bridge = this.bridges.get(userId);
    
    if (!bridge) {
      throw new Error(`Browser bridge not connected for user ${userId}`);
    }

    if (bridge.readyState !== 1) { // WebSocket.OPEN
      throw new Error(`Browser bridge not ready for user ${userId}`);
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

      // Send request to browser
      try {
        bridge.send(JSON.stringify(request));
        logger.debug('Sent bridge request', { userId, requestId, operation });
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Failed to send request'));
      }
    });
  }

  /**
   * Handle response from browser bridge
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
   * Disconnect user bridge
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

