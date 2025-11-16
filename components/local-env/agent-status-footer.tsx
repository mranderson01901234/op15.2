"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle, Terminal, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";

export function AgentStatusFooter() {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded } = useLocalEnvEnabled();
  const [isConnected, setIsConnected] = useState(false);
  const [userHomeDirectory, setUserHomeDirectory] = useState<string | undefined>();
  const [isDownloading, setIsDownloading] = useState(false);
  const [platform, setPlatform] = useState<string>("");

  const checkAgentStatus = useCallback(async () => {
    if (!user || !isEnabled) return;
    
    try {
      // Check actual agent connection status (WebSocket + metadata)
      const response = await fetch(`/api/users/${user.id}/agent-status`, {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const status = await response.json();
        // Agent is connected only if WebSocket is connected AND metadata exists
        setIsConnected(status.connected === true);
        setUserHomeDirectory(status.userHomeDirectory);
      } else {
        // Fallback: Check workspace API
        const workspaceResponse = await fetch(`/api/users/${user.id}/workspace`, {
          cache: 'no-store',
        });
        if (workspaceResponse.ok) {
          const config = await workspaceResponse.json();
          setIsConnected(false); // Can't verify WebSocket, assume disconnected
          setUserHomeDirectory(config.userHomeDirectory);
        } else {
          setIsConnected(false);
        }
      }
    } catch (err) {
      setIsConnected(false);
    }
  }, [user, isEnabled]);

  useEffect(() => {
    if (user && isLoaded && isEnabled) {
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
      checkAgentStatus();
      // Check status periodically
      const interval = setInterval(checkAgentStatus, 10000); // Check every 10 seconds
      return () => clearInterval(interval);
    } else {
      setIsConnected(false);
    }
  }, [user, isLoaded, isEnabled, checkAgentStatus]);

  const handleReinstall = async () => {
    if (!user || !isLoaded || !platform) return;

    setIsDownloading(true);
    try {
      // Download installer script with user ID
      const response = await fetch(
        `/api/agent/download?platform=${platform}&userId=${user.id}`,
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
      const blob = new Blob([installerScript], {
        type: platform === "win32" ? "text/plain" : "text/x-sh",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = platform === "win32" ? "op15-agent-installer.bat" : "op15-agent-installer.sh";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as downloaded
      localStorage.setItem("op15-agent-installed", "downloaded");

      // Show instructions
      const instructions =
        platform === "win32"
          ? `✅ Installer downloaded!\n\nTo complete installation:\n1. Open Downloads folder\n2. Double-click op15-agent-installer.bat\n3. Enter your user ID: ${user.id}\n\nOr run in terminal:\nop15-agent-installer.bat ${user.id}`
          : `✅ Installer downloaded!\n\nTo complete installation:\n1. Open terminal\n2. Run: chmod +x ~/Downloads/op15-agent-installer.sh\n3. Run: ~/Downloads/op15-agent-installer.sh ${user.id}\n\nOr double-click the file and run in terminal.`;

      alert(instructions);
    } catch (err) {
      console.error("Failed to download installer:", err);
      alert("Failed to download installer. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isLoaded || !user || !toggleLoaded || !isEnabled) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground border-t border-border">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isConnected ? (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            <Terminal className="h-3 w-3 shrink-0" />
            <span className="truncate">Agent Connected</span>
          </>
        ) : (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
            <Terminal className="h-3 w-3 shrink-0" />
            <span className="truncate">Agent Not Connected</span>
          </>
        )}
      </div>
      <button
        onClick={handleReinstall}
        disabled={isDownloading || !platform}
        className={cn(
          "shrink-0 px-2 py-1 flex items-center gap-1 rounded text-xs",
          "bg-muted hover:bg-muted/80 text-foreground",
          "border border-border/50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors"
        )}
        title="Reinstall agent installer"
      >
        {isDownloading ? (
          <span className="text-[10px]">...</span>
        ) : (
          <>
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Reinstall</span>
          </>
        )}
      </button>
    </div>
  );
}

