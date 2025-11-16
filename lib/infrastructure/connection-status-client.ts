/**
 * Client-side connection status checking
 * This runs in the browser and can check the user's local agent
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
 * Check agent health from the browser (client-side)
 * This can reach the user's localhost agent
 */
export async function getConnectionStatusClient(userId: string): Promise<ConnectionInfo> {
  // Try default port 4001 first
  let httpHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  let detectedPort: number | undefined;
  let connectionMetadata: ConnectionInfo['metadata'] | undefined;

  // Try default port 4001
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

  // If default port failed, try common alternative ports (4002, 4003, etc.)
  if (httpHealth !== "healthy") {
    for (const port of [4002, 4003, 4004, 4005]) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(200),
        });
        if (response.ok) {
          httpHealth = "healthy";
          detectedPort = port;
          break;
        }
      } catch {
        // Port not available, continue
      }
    }
  }

  // If still unhealthy, mark as unhealthy
  if (httpHealth === "unknown") {
    httpHealth = "unhealthy";
  }

  // If healthy, try to get detailed status
  if (httpHealth === "healthy" && detectedPort) {
    try {
      const statusResponse = await fetch(`http://127.0.0.1:${detectedPort}/status`, {
        signal: AbortSignal.timeout(2000), // Slower for detailed status
      });
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        connectionMetadata = {
          homeDirectory: statusData.homeDirectory || '/home/user',
          platform: statusData.platform || navigator.platform.toLowerCase().includes('win') ? 'win32' : navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux',
          hasPermissions: statusData.hasPermissions || false,
          mode: statusData.mode || null,
        };
      }
    } catch {
      // Status endpoint not available, use defaults
      connectionMetadata = {
        homeDirectory: '/home/user',
        platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux',
        hasPermissions: false,
        mode: null,
      };
    }
  }

  // Check WebSocket connection via server API (optional)
  let isWebSocketConnected = false;
  try {
    const wsStatusResponse = await fetch(`/api/users/${userId}/agent-status`, {
      cache: 'no-store',
    });
    if (wsStatusResponse.ok) {
      const wsStatus = await wsStatusResponse.json();
      isWebSocketConnected = wsStatus.websocketConnected || false;
    }
  } catch {
    // WebSocket check failed, assume not connected
  }

  // Determine status (HTTP-only is primary success mode)
  let status: ConnectionStatus = "none";
  if (httpHealth === "healthy") {
    status = isWebSocketConnected ? "full" : "http-only";
  }

  return {
    status,
    httpPort: httpHealth === "healthy" ? detectedPort : undefined,
    httpHealth,
    lastHealthCheck: Date.now(),
    metadata: connectionMetadata,
  };
}

