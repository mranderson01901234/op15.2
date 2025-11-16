"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface InstallAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: string;
  userId: string;
  onInstallComplete: () => void;
}

export function InstallAgentModal({
  open,
  onOpenChange,
  platform,
  userId,
  onInstallComplete,
}: InstallAgentModalProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Poll for agent connection status after download
  useEffect(() => {
    if (!isComplete || isConnected) return;

    const pollInterval = setInterval(async () => {
      try {
        // Use client-side connection check (can reach localhost from browser)
        const { getConnectionStatusClient } = await import('@/lib/infrastructure/connection-status-client');
        const connectionInfo = await getConnectionStatusClient(userId);

        // Check if agent is connected (using new ConnectionStatus enum)
        if (connectionInfo.status === "http-only" || connectionInfo.status === "full") {
          setIsConnected(true);
          setInstallStep("✅ Agent connected successfully!");
          setIsInstalling(false);
          onInstallComplete();
          
          // Close modal after showing success
          setTimeout(() => {
            onOpenChange(false);
          }, 3000);
        }
      } catch (err) {
        console.error("Failed to check agent status:", err);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 60 seconds
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      if (!isConnected) {
        setInstallStep(prev => prev + "\n\n⏳ Still waiting for agent to connect. Make sure you've run the installer.");
      }
    }, 60000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [isComplete, isConnected, userId, onInstallComplete, onOpenChange]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    setIsConnected(false);
    setInstallStep("Starting automatic installation...");

    try {
      // Check if agent is connected (via bridge manager)
      const { getBridgeManager } = await import('@/lib/infrastructure/bridge-manager');
      const bridgeManager = getBridgeManager();
      
      // Try to check if agent is connected (this will work from browser)
      let isAgentConnected = false;
      try {
        isAgentConnected = await bridgeManager.isConnectedAsync(userId);
      } catch (err) {
        // If check fails, assume not connected
        console.log('Agent connection check failed, will try automatic installation anyway');
      }

      // Get download URL
      const downloadUrl = `/api/agent/download?platform=${platform}`;
      
      // Determine filename and installation commands
      let filename: string;
      let installCommand: string;
      
      if (platform === 'win32') {
        filename = 'OP15-Agent-Setup.exe';
        const downloadPath = `$env:USERPROFILE\\Downloads\\${filename}`;
        installCommand = `powershell -Command "Invoke-WebRequest -Uri '${window.location.origin}${downloadUrl}' -OutFile '${downloadPath}'; Start-Process -FilePath '${downloadPath}' -Wait"`;
      } else {
        // Linux
        filename = 'OP15-Agent-Installer.AppImage';
        const downloadPath = `$HOME/Downloads/${filename}`;
        installCommand = `curl -L -o "${downloadPath}" "${window.location.origin}${downloadUrl}" && chmod +x "${downloadPath}" && "${downloadPath}"`;
      }

      // Try automatic installation if agent is connected
      if (isAgentConnected) {
        setInstallStep("Installing agent automatically...\nThis may take a minute...");

        try {
          // Execute installation via bridge manager
          const result = await bridgeManager.requestBrowserOperation(
            userId,
            'exec.run',
            {
              command: installCommand,
              timeoutMs: 300000, // 5 minutes timeout
            }
          ) as { exitCode: number; stdout: string; stderr: string };

          if (result.exitCode !== 0) {
            throw new Error(`Installation failed: ${result.stderr || result.stdout}`);
          }

          setInstallStep("✅ Installation complete!\n\nWaiting for agent to connect...");
          setIsComplete(true);
          
          // Mark as installed
          localStorage.setItem("op15-agent-installed", "installed");
          return;
        } catch (autoError) {
          console.warn("Automatic installation failed, falling back to manual:", autoError);
          // Fall through to manual download
        }
      }

      // Fallback to manual download
      setInstallStep("Downloading installer...");
      await handleManualDownload();

    } catch (error) {
      console.error("Install error:", error);
      
      // If error, fall back to manual download
      try {
        await handleManualDownload();
      } catch (manualError) {
        setError(error instanceof Error ? error.message : "Installation failed");
        setIsInstalling(false);
      }
    }
  };

  const handleManualDownload = async () => {
    try {
      // Download installer from API
      const response = await fetch(`/api/agent/download?platform=${platform}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Download failed' }));
        const errorMessage = errorData.error || `Download failed: ${response.status}`;
        const errorDetails = errorData.details ? `\n\nDetails: ${errorData.details}` : '';
        const errorHint = errorData.hint ? `\n\nHint: ${errorData.hint}` : '';
        throw new Error(`${errorMessage}${errorDetails}${errorHint}`);
      }

      // Get the installer file as blob
      const blob = await response.blob();
      
      // Determine filename based on platform
      let filename: string;
      if (platform === 'win32') {
        filename = 'OP15-Agent-Setup.exe';
      } else if (platform === 'darwin') {
        filename = 'OP15-Agent-Installer.sh';
      } else {
        filename = 'OP15-Agent-Installer.AppImage';
      }

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as downloaded
      localStorage.setItem("op15-agent-installed", "downloaded");

      // Show instructions
      let instructions: string;
      if (platform === 'win32') {
        instructions = `✅ Installer downloaded!\n\nTo complete installation:\n1. Open your Downloads folder\n2. Double-click "${filename}"\n3. Follow the installation wizard\n4. The agent will start automatically`;
      } else {
        instructions = `✅ Installer downloaded!\n\nTo complete installation:\n1. Open your Downloads folder\n2. Right-click "${filename}" → Properties → Permissions\n3. Check "Allow executing file as program"\n4. Double-click "${filename}" to run`;
      }

      setInstallStep(instructions);
      setIsComplete(true);

    } catch (error) {
      console.error("Download error:", error);
      setError(error instanceof Error ? error.message : "Download failed");
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Install Local Agent
          </DialogTitle>
          <DialogDescription>
            Install the op15 agent to access your local environment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current step display */}
          {installStep && (
            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground whitespace-pre-line">{installStep}</p>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-md flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Installation Failed</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Waiting for connection */}
          {isComplete && !isConnected && !error && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-md space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Waiting for agent to connect...
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                This usually takes 5-10 seconds
              </p>
            </div>
          )}

          {/* Success */}
          {isConnected && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-md flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Agent Connected!
                </p>
                <p className="text-xs text-muted-foreground">
                  Your local environment is now accessible
                </p>
              </div>
            </div>
          )}

          {/* Install button */}
          {!isInstalling && !isComplete && (
            <Button
              onClick={handleInstall}
              className="w-full"
              size="lg"
            >
              Install Agent
            </Button>
          )}

          {/* Installing state */}
          {isInstalling && !isComplete && (
            <Button
              disabled
              className="w-full"
              size="lg"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Installing...
            </Button>
          )}

          {/* Platform info */}
          <div className="text-xs text-muted-foreground text-center">
            Platform: {platform} • User ID: {userId.slice(0, 12)}...
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

