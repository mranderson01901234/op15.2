"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { AlertCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";
import { InstallAgentModal } from "./install-agent-modal-simple";
import type { ConnectionStatus } from "@/lib/infrastructure/connection-status";

export function AgentConnectionGuide() {
  const { user } = useUser();
  const { isEnabled } = useLocalEnvEnabled();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("none");
  const [checking, setChecking] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [platform, setPlatform] = useState<string>("");

  useEffect(() => {
    if (!user || !isEnabled) return;

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
    }

    const checkConnection = async () => {
      try {
        // First check /health directly for fast detection
        try {
          const healthResponse = await fetch('http://127.0.0.1:4001/health', {
            signal: AbortSignal.timeout(200),
          });
          if (healthResponse.ok) {
            // Agent is running - check registration status
            const response = await fetch(`/api/users/${user.id}/agent-status`);
            if (response.ok) {
              const status = await response.json();
              const newStatus: ConnectionStatus = status.status || "none";
              setConnectionStatus(newStatus);
            } else {
              setConnectionStatus("none");
            }
          } else {
            setConnectionStatus("none");
          }
        } catch {
          // Health check failed - agent not running
          setConnectionStatus("none");
        }
      } catch (err) {
        setConnectionStatus("none");
      } finally {
        setChecking(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [user, isEnabled]);

  // Only show when local env is enabled, user is logged in, and agent is NOT connected
  if (!user || !isEnabled) {
    return null;
  }

  // Only show if status is "none" (not connected)
  if (connectionStatus !== "none") {
    return null;
  }

  // Don't show while checking (avoid flash)
  if (checking) {
    return null;
  }

  return (
    <>
      <InstallAgentModal
        open={showInstallModal}
        onOpenChange={setShowInstallModal}
        platform={platform}
        userId={user?.id || ""}
        onInstallComplete={() => {
          setShowInstallModal(false);
          // Status will be checked by polling
        }}
      />
      <div className="p-3 border border-yellow-500/30 rounded-lg bg-yellow-500/10 space-y-3">
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

        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Click the button below to download and install the agent. No terminal commands or build tools required.
          </p>
          
          <button
            onClick={() => setShowInstallModal(true)}
            className={cn(
              "w-full px-3 py-2 flex items-center justify-center gap-2 rounded-md text-xs font-medium",
              "bg-blue-500 text-white hover:bg-blue-600",
              "transition-colors"
            )}
          >
            <Download className="h-3 w-3" />
            <span>Install Local Agent</span>
          </button>

          <div className="text-[10px] text-muted-foreground mt-2">
            The installer will set up the agent automatically. Once installed, approve permissions to start using features.
          </div>
        </div>
      </div>
    </>
  );
}
