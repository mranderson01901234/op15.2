"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { Download, CheckCircle, AlertCircle, Loader2, Terminal, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { InstallAgentModal } from "./install-agent-modal-simple";
import type { ConnectionStatus } from "@/lib/infrastructure/connection-status";
import { getStatusDisplay } from "@/lib/infrastructure/connection-status";

export function AgentAutoInstaller() {
  const { user, isLoaded } = useUser();
  const [isInstalling, setIsInstalling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("none");
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const checkAgentStatus = useCallback(async () => {
    if (!user) return;
    
    setCheckingStatus(true);
    try {
      // Check actual agent connection status using ConnectionStatus enum
      const response = await fetch(`/api/users/${user.id}/agent-status`, {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const status = await response.json();
        // Use the new ConnectionStatus enum
        const newStatus: ConnectionStatus = status.status || "none";
        setConnectionStatus(newStatus);
        
        // Log diagnostics if not connected
        if (newStatus === "none") {
          console.log('Agent status check:', {
            status: newStatus,
            httpHealth: status.httpHealth,
            httpPort: status.httpPort,
            metadata: status.metadata,
          });
        }
      } else {
        // Fallback: Check workspace API for metadata
        const workspaceResponse = await fetch(`/api/users/${user.id}/workspace`, {
          cache: 'no-store',
        });
        if (workspaceResponse.ok) {
          const config = await workspaceResponse.json();
          // If we have metadata but no connection, status is still "none"
          setConnectionStatus("none");
        } else {
          // Check localStorage as fallback
          const agentInstalled = localStorage.getItem("op15-agent-installed");
          setConnectionStatus(agentInstalled === "true" || agentInstalled === "downloaded" ? "none" : "none");
        }
      }
    } catch (err) {
      console.error('Failed to check agent status:', err);
      // Check localStorage as fallback
      const agentInstalled = localStorage.getItem("op15-agent-installed");
      setConnectionStatus(agentInstalled === "true" || agentInstalled === "downloaded" ? "none" : "none");
    } finally {
      setCheckingStatus(false);
    }
  }, [user]);

  useEffect(() => {
    // Always check agent status
    if (!user) return;
    
    // Detect platform
    if (typeof window !== "undefined") {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) {
        setPlatform("win32");
      } else if (userAgent.includes("mac")) {
        setPlatform("darwin");
      } else {
        setPlatform("linux");
      }

      // On mount, check if agent is already running via direct /health check
      const checkRunningAgent = async () => {
        try {
          // Try default port 4001
          const healthResponse = await fetch('http://127.0.0.1:4001/health', {
            signal: AbortSignal.timeout(200), // Fast check
          });
          
          if (healthResponse.ok) {
            // Agent is running - check if registered
            await checkAgentStatus();
          } else {
            // Agent not responding - show install button
            setConnectionStatus("none");
            setCheckingStatus(false);
          }
        } catch {
          // Agent not running - show install button
          setConnectionStatus("none");
          setCheckingStatus(false);
        }
      };
      
      checkRunningAgent();
    }
  }, [user, checkAgentStatus]);

  const handleInstall = () => {
    if (!user || !isLoaded) {
      setError("Please sign in first");
      return;
    }
    setShowInstallModal(true);
  };

  const handleInstallComplete = () => {
    // Mark as downloaded/installed
    localStorage.setItem("op15-agent-installed", "downloaded");
    setShowInstallModal(false);
    
    // Check status after a delay
    setTimeout(() => {
      checkAgentStatus();
    }, 2000);
  };

  const handleReinstall = () => {
    // Clear installation status to allow reinstall
    localStorage.removeItem("op15-agent-installed");
    setConnectionStatus("none");
    // Trigger install flow
    handleInstall();
  };

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <>
      <InstallAgentModal
        open={showInstallModal}
        onOpenChange={setShowInstallModal}
        platform={platform}
        userId={user?.id || ""}
        onInstallComplete={handleInstallComplete}
      />
      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-foreground">
            Local Agent
          </div>
        </div>

      {checkingStatus ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Checking status...</span>
        </div>
      ) : connectionStatus === "http-only" || connectionStatus === "full" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 py-1">
            <CheckCircle className="h-3 w-3" />
            <span>{getStatusDisplay(connectionStatus).text}</span>
          </div>
          <button
            onClick={handleReinstall}
            disabled={isInstalling}
            className={cn(
              "w-full px-3 py-1.5 flex items-center justify-center gap-2 rounded-md text-xs",
              "bg-muted hover:bg-muted/80 text-foreground",
              "border border-border",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
            title="Reinstall agent (useful if you deleted the installer)"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                <span>Reinstall Agent</span>
              </>
            )}
          </button>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Reinstall if you deleted the installer or need to update
          </div>
        </div>
      ) : connectionStatus === "none" ? (
        <div className="space-y-3">
          <div className="p-3 border border-yellow-500/30 rounded-lg bg-yellow-500/10 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h4 className="text-xs font-semibold text-foreground">
                  Agent Not Connected
                </h4>
                <p className="text-xs text-muted-foreground">
                  To use local environment features, you need to install the agent on your machine.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className={cn(
              "w-full px-3 py-2 flex items-center justify-center gap-2 rounded-md text-xs font-medium",
              "bg-blue-500 text-white hover:bg-blue-600",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                <span>Install Local Agent</span>
              </>
            )}
          </button>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 py-1">
              <XCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground leading-relaxed">
            The installer will set up the agent automatically. No terminal commands or build tools required.
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}
