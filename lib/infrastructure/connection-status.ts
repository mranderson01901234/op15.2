/**
 * Connection status enum for local agent
 * For v1 of the product, `"http-only"` **is the success path**.
 * `"full"` (HTTP + WebSocket) is optional and not required for any critical feature.
 * WebSocket is unstable and will be treated as optional/future real-time channel.
 */
export type ConnectionStatus = 
  | "none"       // No agent detected
  | "http-only"  // HTTP API available (production success path)
  | "full";      // HTTP + WebSocket (optional, future real-time features only)

export interface ConnectionInfo {
  status: ConnectionStatus;
  httpPort?: number;
  httpHealth: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck: number;
  metadata?: {
    homeDirectory: string;
    platform: string;
    hasPermissions: boolean;
    mode: 'safe' | 'balanced' | 'unrestricted' | null;
  };
}

/**
 * Check agent health via HTTP /health endpoint
 * Fast check (<200ms timeout)
 */
export async function getConnectionStatus(userId: string): Promise<ConnectionInfo> {
  // 1. Get httpPort from cache (or default 4001)
  const metadata = (global as any).agentMetadata?.get(userId);
  const httpPort = metadata?.httpPort || 4001;
  
  // 2. Check HTTP /health endpoint (fast)
  // Try default port 4001 first, then check metadata port if different
  let httpHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  let detectedPort: number | undefined;
  
  // Try default port first (works even if metadata not registered)
  try {
    const response = await fetch(`http://127.0.0.1:4001/health`, {
      signal: AbortSignal.timeout(200), // Fast check
    });
    if (response.ok) {
      httpHealth = "healthy";
      detectedPort = 4001;
    }
  } catch {
    // Default port not available
  }
  
  // If default port failed and we have metadata with different port, try that
  if (httpHealth !== "healthy" && metadata?.httpPort && metadata.httpPort !== 4001) {
    try {
      const response = await fetch(`http://127.0.0.1:${metadata.httpPort}/health`, {
        signal: AbortSignal.timeout(200),
      });
      if (response.ok) {
        httpHealth = "healthy";
        detectedPort = metadata.httpPort;
      }
    } catch {
      // Metadata port also failed
    }
  }
  
  // If still unhealthy, mark as unhealthy
  if (httpHealth === "unknown") {
    httpHealth = "unhealthy";
  }
  
  // 3. Check WebSocket connection (optional, for "full" status)
  const bridgeManager = await import('./bridge-manager').then(m => m.getBridgeManager());
  const isWebSocketConnected = bridgeManager.isConnected(userId);
  
  // 4. Determine status (HTTP-only is primary success mode)
  let status: ConnectionStatus = "none";
  if (httpHealth === "healthy") {
    status = isWebSocketConnected ? "full" : "http-only";
  }
  
  // 5. Get metadata if available (try HTTP /status endpoint even without metadata cache)
  let connectionMetadata: ConnectionInfo['metadata'] | undefined;
  if (httpHealth === "healthy" && detectedPort) {
    // Try to get permissions and mode from HTTP /status endpoint
    try {
      const statusResponse = await fetch(`http://127.0.0.1:${detectedPort}/status`, {
        signal: AbortSignal.timeout(2000), // Slower for detailed status
      });
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        connectionMetadata = {
          homeDirectory: metadata?.homeDirectory || process.env.HOME || '/home/user',
          platform: metadata?.platform || process.platform || 'linux',
          hasPermissions: statusData.hasPermissions || false,
          mode: statusData.mode || null,
        };
      } else {
        // Fallback to basic metadata
        connectionMetadata = {
          homeDirectory: metadata?.homeDirectory || process.env.HOME || '/home/user',
          platform: metadata?.platform || process.platform || 'linux',
          hasPermissions: false,
          mode: null,
        };
      }
    } catch {
      // Fallback to basic metadata
      connectionMetadata = {
        homeDirectory: metadata?.homeDirectory || process.env.HOME || '/home/user',
        platform: metadata?.platform || process.platform || 'linux',
        hasPermissions: false,
        mode: null,
      };
    }
  }
  
  // 6. Update cache (create metadata if agent detected but not in cache)
  if (httpHealth === "healthy" && detectedPort) {
    if (!(global as any).agentMetadata) {
      (global as any).agentMetadata = new Map();
    }
    
    // Update or create metadata entry
    const existingMetadata = (global as any).agentMetadata.get(userId) || {};
    (global as any).agentMetadata.set(userId, {
      ...existingMetadata,
      httpPort: detectedPort,
      homeDirectory: connectionMetadata?.homeDirectory || existingMetadata.homeDirectory || process.env.HOME || '/home/user',
      platform: connectionMetadata?.platform || existingMetadata.platform || process.platform || 'linux',
      lastHealthCheck: Date.now(),
    });
  }
  
  return {
    status,
    httpPort: httpHealth === "healthy" ? (detectedPort || httpPort) : undefined,
    httpHealth,
    lastHealthCheck: Date.now(),
    metadata: connectionMetadata,
  };
}

/**
 * Feature availability based on connection status
 */
export const FEATURE_AVAILABILITY = {
  "none": {
    available: [],
    message: "Install agent to enable local environment features",
  },
  "http-only": {
    available: ["fs.list", "fs.read", "fs.write", "fs.delete", "fs.move", "exec.run", "permissions", "logs"],
    message: "Connected via HTTP (all features available)",
  },
  "full": {
    available: ["all"],
    message: "Connected via HTTP + WebSocket (all features available)",
  },
} as const;

/**
 * Get display information for connection status
 */
export function getStatusDisplay(status: ConnectionStatus) {
  switch (status) {
    case "none":
      return { 
        text: "Not Connected", 
        color: "gray",
        icon: "❌",
        action: "Install Agent"
      };
    case "http-only":
      return { 
        text: "Connected", 
        color: "green",
        icon: "✅",
        action: null // Already connected
      };
    case "full":
      return { 
        text: "Connected (Full)", 
        color: "green",
        icon: "✅",
        action: null
      };
  }
}

