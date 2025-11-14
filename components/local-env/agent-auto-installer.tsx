"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Download, CheckCircle, AlertCircle, Loader2, Terminal, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentAutoInstaller() {
  const { user, isLoaded } = useUser();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
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

      // Check if agent is already installed and connected
      checkAgentStatus();
    }
  }, [user]);

  const checkAgentStatus = async () => {
    if (!user) return;
    
    setCheckingStatus(true);
    try {
      // Check if agent is connected via API
      const response = await fetch(`/api/users/${user.id}/workspace`);
      if (response.ok) {
        const config = await response.json();
        // If we have userHomeDirectory, agent is likely connected
        if (config.userHomeDirectory) {
          setIsInstalled(true);
          setIsConnected(true);
        } else {
          // Check localStorage as fallback
          const agentInstalled = localStorage.getItem("op15-agent-installed");
          setIsInstalled(agentInstalled === "true");
          setIsConnected(false);
        }
      }
    } catch (err) {
      // Check localStorage as fallback
      const agentInstalled = localStorage.getItem("op15-agent-installed");
      setIsInstalled(agentInstalled === "true");
      setIsConnected(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleInstall = async () => {
    if (!user || !isLoaded) {
      setError("Please sign in first");
      return;
    }

    setIsInstalling(true);
    setError(null);

    try {
      // Download installer script with user ID
      const response = await fetch(
        `/api/agent/download?platform=${platform}`,
        {
          headers: {
            'X-User-Id': user.id,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download installer");
      }

      const installerScript = await response.text();

      // Create blob and download
      const blob = new Blob([installerScript], {
        type: platform === "win32" ? "text/plain" : "text/x-sh",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        platform === "win32"
          ? "op15-agent-installer.bat"
          : "op15-agent-installer.sh";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as installed
      localStorage.setItem("op15-agent-installed", "true");
      setIsInstalled(true);

      // Show instructions with user ID
      const instructions =
        platform === "win32"
          ? `Installer downloaded!\n\nRun as administrator:\nop15-agent-installer.bat ${user.id}\n\nOr double-click and enter your user ID when prompted.`
          : `Installer downloaded!\n\nRun:\nchmod +x op15-agent-installer.sh\n./op15-agent-installer.sh ${user.id}\n\nThe agent will automatically start and connect to your account.`;

      alert(instructions);
      
      // Check status after a delay
      setTimeout(() => {
        checkAgentStatus();
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download installer"
      );
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-foreground">
          Local Agent
        </div>
        {isConnected && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Connected</span>
          </div>
        )}
      </div>

      {checkingStatus ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Checking status...</span>
        </div>
      ) : isConnected ? (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 py-1">
          <CheckCircle className="h-3 w-3" />
          <span>Agent installed and running</span>
        </div>
      ) : isInstalled ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 py-1">
            <AlertCircle className="h-3 w-3" />
            <span>Agent installed but not connected</span>
          </div>
          <button
            onClick={checkAgentStatus}
            className={cn(
              "w-full px-3 py-1.5 flex items-center justify-center gap-2 rounded-md text-xs",
              "bg-muted hover:bg-muted/80 text-foreground",
              "border border-border",
              "transition-colors"
            )}
          >
            <Terminal className="h-3 w-3" />
            <span>Check Connection</span>
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className={cn(
              "w-full px-3 py-1.5 flex items-center justify-center gap-2 rounded-md text-xs font-medium",
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

          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
            One-click installer for full filesystem access without browser restrictions
          </div>
        </>
      )}
    </div>
  );
}
