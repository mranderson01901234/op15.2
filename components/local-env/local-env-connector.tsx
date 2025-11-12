"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { LocalEnvBridge } from "@/lib/browser/local-env-bridge";
import { logger } from "@/lib/utils/logger";
import { cn } from "@/lib/utils";

// Check browser compatibility on component load
const isBrowserCompatible = LocalEnvBridge.isSupported();
const compatibilityMessage = LocalEnvBridge.getCompatibilityMessage();

interface LocalEnvConnectorProps {
  isCollapsed?: boolean;
}

export function LocalEnvConnector({ isCollapsed = false }: LocalEnvConnectorProps) {
  const { user, isLoaded } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridge, setBridge] = useState<LocalEnvBridge | null>(null);

  useEffect(() => {
    // Check if bridge is already connected
    // This would be stored in localStorage or context
    const storedConnection = localStorage.getItem('localEnvConnected');
    if (storedConnection === 'true') {
      setIsConnected(true);
    }
  }, []);

  const handleConnect = async () => {
    if (!user || !isLoaded) {
      setError('Please sign in first');
      return;
    }

    // Check browser compatibility first
    if (!LocalEnvBridge.isSupported()) {
      const message = LocalEnvBridge.getCompatibilityMessage();
      setError(message || 'File System Access API is not supported in this browser');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // 1. Request server instance and connection details
      const response = await fetch(`/api/users/${user.id}/local-env`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = errorData.error || errorData.message || `Failed to connect: ${response.statusText}`;
        logger.error('Local env connection failed', undefined, {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
        });
        throw new Error(errorMessage);
      }

      const { serverUrl, websocketUrl } = await response.json();

      console.log('Received server details', { serverUrl, websocketUrl, userId: user.id });

      // 2. Initialize browser bridge
      const localBridge = new LocalEnvBridge(serverUrl, user.id);
      
      // 3. Connect (this will request file system access)
      console.log('Starting bridge connection...');
      await localBridge.connect();
      console.log('Bridge connection completed successfully');

      // 4. Store connection state
      setBridge(localBridge);
      setIsConnected(true);
      localStorage.setItem('localEnvConnected', 'true');
      localStorage.setItem('localEnvServerUrl', serverUrl);

      logger.info('Local environment connected', { userId: user.id });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMessage);
      logger.error('Local environment connection failed', err instanceof Error ? err : undefined, { 
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (bridge) {
      bridge.disconnect();
      setBridge(null);
    }
    setIsConnected(false);
    localStorage.removeItem('localEnvConnected');
    localStorage.removeItem('localEnvServerUrl');
  };

  if (!isLoaded || !user) {
    return null;
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <button
      onClick={isConnected ? handleDisconnect : handleConnect}
      disabled={isConnecting}
      className="px-3 py-1.5 flex items-center gap-2 rounded-full bg-transparent hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className={cn(
        "h-1.5 w-1.5 rounded-full shrink-0",
        isConnected ? "bg-green-500" : "bg-muted-foreground"
      )} />
      <span className="text-xs text-muted-foreground">
        {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
      </span>
    </button>
  );
}

