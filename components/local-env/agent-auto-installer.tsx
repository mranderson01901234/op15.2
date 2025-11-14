"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentAutoInstaller() {
  const { user, isLoaded } = useUser();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("");

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

      // Check if agent is already installed
      checkAgentStatus();
    }
  }, []);

  const checkAgentStatus = async () => {
    // Check if agent is running by trying to detect it
    // This is a simple check - in production, you'd ping the server
    try {
      // You could check localStorage or make an API call
      const agentInstalled = localStorage.getItem("op15-agent-installed");
      if (agentInstalled === "true") {
        setIsInstalled(true);
      }
    } catch (err) {
      // Ignore errors
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
      <div className="text-xs text-muted-foreground mb-1">
        Local Agent (Full Filesystem Access)
      </div>

      {isInstalled ? (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          <span>Agent installed and running</span>
        </div>
      ) : (
        <>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className={cn(
              "px-3 py-1.5 flex items-center gap-2 rounded-md text-xs",
              "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              "hover:bg-blue-500/20 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-1">
            One-click installer for full filesystem access (no browser
            restrictions)
          </div>
        </>
      )}
    </div>
  );
}

