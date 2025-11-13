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
  const [unrestrictedMode, setUnrestrictedMode] = useState(false);

  useEffect(() => {
    // Check if bridge is already connected
    // This would be stored in localStorage or context
    const storedConnection = localStorage.getItem('localEnvConnected');
    if (storedConnection === 'true') {
      setIsConnected(true);
    }
    // Restore unrestricted mode preference
    const storedUnrestricted = localStorage.getItem('localEnvUnrestricted');
    if (storedUnrestricted === 'true') {
      setUnrestrictedMode(true);
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

      const data = await response.json();
      const { serverUrl, websocketUrl } = data;

      console.log('Received server details', { serverUrl, websocketUrl, userId: user.id, fullData: data });

      // Validate serverUrl is present and valid
      if (!serverUrl || serverUrl === 'undefined' || serverUrl.includes('undefined')) {
        const errorMsg = `Invalid server URL received from API: ${serverUrl}. Please check your NEXT_PUBLIC_APP_URL or RAILWAY_PUBLIC_DOMAIN environment variable.`;
        console.error(errorMsg, { serverUrl, data });
        throw new Error(errorMsg);
      }

      // 2. Initialize browser bridge
      const localBridge = new LocalEnvBridge(serverUrl, user.id);
      
      // 3. Connect (this will request file system access)
      console.log('Starting bridge connection...', { unrestrictedMode });
      await localBridge.connect(unrestrictedMode);
      console.log('Bridge connection completed successfully');

      // 4. Store connection state
      setBridge(localBridge);
      setIsConnected(true);
      localStorage.setItem('localEnvConnected', 'true');
      localStorage.setItem('localEnvServerUrl', serverUrl);
      localStorage.setItem('localEnvUnrestricted', unrestrictedMode.toString());

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

  // Check if error is Vercel-related
  const isVercelError = error?.toLowerCase().includes('vercel') || error?.toLowerCase().includes('serverless');

  return (
    <div className="flex flex-col gap-1">
      {!isConnected && !isConnecting && isBrowserCompatible && (
        <label className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted rounded-md transition-colors">
          <input
            type="checkbox"
            checked={unrestrictedMode}
            onChange={(e) => setUnrestrictedMode(e.target.checked)}
            className="h-3 w-3 rounded border-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">
            Unrestricted mode (select parent directory)
          </span>
        </label>
      )}
      {!isConnected && !isConnecting && unrestrictedMode && (
        <div className="text-xs px-3 py-1.5 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
          <div className="font-medium mb-1">Unrestricted Mode Active</div>
          <div>Select the HIGHEST directory you want access to. For example:</div>
          <div className="mt-1 font-mono text-[11px]">• Select /home to access all user directories</div>
          <div className="font-mono text-[11px]">• Select /home/user to access only that user's files</div>
          <div className="mt-1 text-[11px] opacity-90">You cannot navigate to parent directories after selection.</div>
        </div>
      )}
      <button
        onClick={isConnected ? handleDisconnect : handleConnect}
        disabled={isConnecting || !isBrowserCompatible}
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
      {error && (
        <div className={cn(
          "text-xs px-3 py-1.5 rounded-md",
          isVercelError 
            ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
        )}>
          {isVercelError ? (
            <div className="space-y-1">
              <div className="font-medium">WebSocket not available on Vercel</div>
              <div className="text-xs opacity-90">
                The local environment bridge requires a persistent WebSocket connection, which is not supported on Vercel serverless functions. 
                This feature works on custom server deployments.
              </div>
            </div>
          ) : (
            <div>{error}</div>
          )}
        </div>
      )}
      {!isBrowserCompatible && !error && (
        <div className="text-xs px-3 py-1.5 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
          {compatibilityMessage || 'File System Access API is not supported in this browser'}
        </div>
      )}
    </div>
  );
}

