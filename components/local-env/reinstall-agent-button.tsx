"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Download, Loader2 } from "lucide-react";

export function ReinstallAgentButton() {
  const { user, isLoaded } = useUser();
  const [isDownloading, setIsDownloading] = useState(false);
  const [platform, setPlatform] = useState<string>("");

  useEffect(() => {
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
  }, []);
  
  useEffect(() => {
    console.log('[ReinstallAgentButton] Component mounted', { user: !!user, isLoaded, platform });
  }, [user, isLoaded, platform]);

  const handleReinstall = async () => {
    if (!user || !isLoaded) return;
    
    let detectedPlatform = platform;
    if (!detectedPlatform && typeof window !== "undefined") {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) {
        detectedPlatform = "win32";
      } else if (userAgent.includes("mac")) {
        detectedPlatform = "darwin";
      } else {
        detectedPlatform = "linux";
      }
      setPlatform(detectedPlatform);
    }
    
    if (!detectedPlatform) {
      alert("Unable to detect your platform. Please try again.");
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch(
        `/api/agent/download?platform=${detectedPlatform}&userId=${user.id}`,
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
        type: detectedPlatform === "win32" ? "text/plain" : "text/x-sh",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = detectedPlatform === "win32" ? "op15-agent-installer.bat" : "op15-agent-installer.sh";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      localStorage.setItem("op15-agent-installed", "downloaded");

      const instructions =
        detectedPlatform === "win32"
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

  // ALWAYS render - remove all conditions for debugging
  return (
    <div
      id="reinstall-agent-button-container"
      className="fixed bottom-4 right-4 z-[99999]"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        zIndex: 99999,
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
        pointerEvents: 'auto',
        backgroundColor: 'red', // DEBUG: Make it super visible
        padding: '10px',
      }}
    >
      <button
        onClick={handleReinstall}
        disabled={isDownloading || !user || !isLoaded}
        className="px-4 py-3 text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border-2 border-blue-600"
        style={{
          WebkitAppearance: 'none',
          appearance: 'none',
          cursor: isDownloading || !user || !isLoaded ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          visibility: 'visible',
          opacity: 1,
          pointerEvents: 'auto',
          backgroundColor: 'rgb(59, 130, 246)',
          color: 'white',
        }}
        title={!user ? "Please sign in" : "Reinstall agent installer"}
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Downloading...</span>
          </>
        ) : !user ? (
          <>
            <Download className="h-4 w-4 shrink-0" />
            <span>Sign In to Reinstall</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4 shrink-0" />
            <span>Reinstall Agent</span>
          </>
        )}
      </button>
    </div>
  );
}

