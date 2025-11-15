"use client";

import { useUser } from "@clerk/nextjs";
import { Terminal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export function LocalEnvToggle() {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded, setEnabled } = useLocalEnvEnabled();
  const hasAutoDownloadedRef = useRef(false);

  // Auto-download installer when local environment is enabled for the first time
  useEffect(() => {
    if (!isLoaded || !user || !toggleLoaded || !isEnabled || hasAutoDownloadedRef.current) {
      return;
    }

    // Check if agent is already connected
    const checkAndDownload = async () => {
      try {
        const response = await fetch(`/api/users/${user.id}/workspace`);
        if (response.ok) {
          const config = await response.json();
          // If agent is already connected, don't download
          if (config.userHomeDirectory) {
            return;
          }
        }
      } catch (err) {
        // Ignore errors, proceed with download
      }

      // Check if installer was already downloaded (don't spam downloads)
      const wasInstalled = localStorage.getItem("op15-agent-installed");
      if (wasInstalled === "true") {
        return;
      }

      // Auto-download installer
      hasAutoDownloadedRef.current = true;
      downloadInstaller();
    };

    checkAndDownload();
  }, [user, isLoaded, toggleLoaded, isEnabled]);

  const downloadInstaller = async () => {
    if (!user) return;

    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    let platform = "linux";
    if (userAgent.includes("win")) {
      platform = "win32";
    } else if (userAgent.includes("mac")) {
      platform = "darwin";
    }

    try {
      // Include user ID in download request so it's pre-configured in installer
      const response = await fetch(`/api/agent/download?platform=${platform}&userId=${user.id}`, {
        headers: {
          'X-User-Id': user.id,
        },
      });
      if (!response.ok) {
        console.warn("Failed to auto-download installer");
        return;
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

      // Mark as downloaded (not installed yet)
      localStorage.setItem("op15-agent-installed", "downloaded");

      // Show notification
      console.log("✅ Installer downloaded automatically. Please run it to complete installation.");
    } catch (err) {
      console.error("Failed to auto-download installer:", err);
    }
  };

  if (!isLoaded || !user || !toggleLoaded) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs border-b border-border">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground truncate">Local Environment</span>
      </div>
      <Switch
        checked={isEnabled}
        onCheckedChange={(enabled) => {
          setEnabled(enabled);
          // Reset download flag when disabled
          if (!enabled) {
            hasAutoDownloadedRef.current = false;
          }
        }}
        className="shrink-0"
      />
    </div>
  );
}

