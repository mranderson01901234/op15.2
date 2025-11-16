"use client";

import { useState, useEffect } from "react";
import { X, Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
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

  // Execute installer directly from modal using File System Access API
  const executeInstallerInModal = async (fileHandle: FileSystemFileHandle, platform: string): Promise<boolean> => {
    try {
      const file = await fileHandle.getFile();
      
      // Method 1: Create executable wrapper and try to open it
      if (platform === "win32") {
        // Windows: Create .bat wrapper and try to execute
        const batContent = `@echo off
cd /d "%~dp0"
node "${file.name}" "${userId}"
pause
`;
        
        // Save .bat wrapper using File System Access API
        try {
          const batHandle = await (window as any).showSaveFilePicker({
            suggestedName: file.name.replace('.js', '.bat'),
            types: [{
              description: "Batch File",
              accept: { "text/plain": [".bat"] },
            }],
          });
          
          const batWritable = await batHandle.createWritable();
          await batWritable.write(batContent);
          await batWritable.close();
          
          // Try to execute the .bat file
          const batFile = await batHandle.getFile();
          const batBlob = new Blob([batContent], { type: "application/x-msdownload" });
          const batUrl = URL.createObjectURL(batBlob);
          
          // Try multiple methods to execute
          window.open(batUrl, '_blank');
          setTimeout(() => {
            // Also try direct file access
            const link = document.createElement('a');
            link.href = batUrl;
            link.download = batFile.name;
            link.click();
          }, 100);
          
          URL.revokeObjectURL(batUrl);
          
          // Return true - execution attempted (user may need to allow)
          return true;
        } catch (err) {
          console.warn('BAT wrapper creation failed:', err);
        }
      } else {
        // Mac/Linux: Create shell script wrapper
        const scriptContent = `#!/bin/bash
cd "$(dirname "$0")"
node "${file.name}" "${userId}"
`;
        
        try {
          const scriptHandle = await (window as any).showSaveFilePicker({
            suggestedName: file.name.replace('.js', '.sh'),
            types: [{
              description: "Shell Script",
              accept: { "text/x-sh": [".sh"] },
            }],
          });
          
          const scriptWritable = await scriptHandle.createWritable();
          await scriptWritable.write(scriptContent);
          await scriptWritable.close();
          
          // Try to execute
          const scriptFile = await scriptHandle.getFile();
          const scriptBlob = new Blob([scriptContent], { type: "text/x-sh" });
          const scriptUrl = URL.createObjectURL(scriptBlob);
          window.open(scriptUrl, '_blank');
          URL.revokeObjectURL(scriptUrl);
          
          return true; // Execution attempted
        } catch (err) {
          console.warn('Shell script creation failed:', err);
        }
      }
      
      // Method 2: Try to open the file directly
      try {
        const fileBlob = await file.arrayBuffer();
        const blobUrl = URL.createObjectURL(new Blob([fileBlob], { 
          type: platform === "win32" ? "application/x-msdownload" : "text/javascript" 
        }));
        
        // Try to open with default handler
        window.open(blobUrl, '_blank');
        URL.revokeObjectURL(blobUrl);
        
        return true; // Execution attempted
      } catch (err) {
        console.warn('Direct file open failed:', err);
      }
      
      return false;
    } catch (error) {
      console.warn('Execution attempt failed:', error);
      return false;
    }
  };

  // Poll for agent connection
  useEffect(() => {
    if (!isInstalling || isConnected) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/users/${userId}/agent-status`, {
          cache: 'no-store',
        });
        if (response.ok) {
          const status = await response.json();
          if (status.connected) {
            setIsConnected(true);
            setInstallStep("✅ Agent connected!");
            setIsComplete(true);
            clearInterval(pollInterval);
            // Auto-close after 2 seconds
            setTimeout(() => {
              onInstallComplete();
              onOpenChange(false);
            }, 2000);
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [isInstalling, isConnected, userId, onInstallComplete, onOpenChange]);

  const handleAuthorizeInstall = async () => {
    setIsInstalling(true);
    setError(null);
    setIsConnected(false);
    setInstallStep("Starting installation...");

    try {
      // Call backend to install agent directly (no downloads!)
      const response = await fetch('/api/agent/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Installation failed');
      }

      // Installation complete!
      setInstallStep(data.message || "Agent installed successfully!");
      setIsComplete(true);
      
      // Start polling for agent connection
      // The agent should connect shortly
      
    } catch (error) {
      console.error("Installation error:", error);
      setError(error instanceof Error ? error.message : "Installation failed");
      setIsInstalling(false);
    }
  };

  // Removed unused OLD function - was causing build errors


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                Installation Complete
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Install Local Agent
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isComplete && isConnected
              ? "Agent installed and connected successfully!"
              : isComplete
              ? "The installer has been downloaded. Please complete the installation."
              : "Installing the local agent to enable full filesystem access and command execution."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {installStep && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md text-sm">
              {isInstalling && !isComplete && (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              )}
              {isComplete && (
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              )}
              <span>{installStep}</span>
            </div>
          )}

          {!isInstalling && !isComplete && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click "Install Agent" to automatically download and install the agent behind the scenes.
                The installer will be saved to your Downloads folder.
              </p>
            </div>
          )}

          {isComplete && !isConnected && (
            <div className="p-4 bg-muted rounded-md space-y-3">
              <p className="text-sm font-medium text-blue-400">📥 Next Step</p>
              <p className="text-sm text-muted-foreground">
                Double-click the downloaded file to install the agent:
              </p>
              <div className="p-2 bg-background rounded text-xs font-mono border border-border">
                {platform === 'win32' && '📦 op15-agent-installer.exe'}
                {platform === 'darwin' && '📦 op15-agent-installer'}
                {platform === 'linux' && '📦 op15-agent-installer.run'}
              </div>
              <p className="text-xs text-muted-foreground">
                {platform === 'win32' && '💡 Double-click the installer. It will open your browser and install automatically.'}
                {platform === 'darwin' && '💡 Double-click the installer. If macOS blocks it, go to System Settings → Security & Privacy to allow.'}
                {platform === 'linux' && (
                  <span>
                    💡 Right-click → Properties → Permissions → Check "Allow executing file as program", then double-click.
                    <br />The installer will open your browser and complete automatically.
                  </span>
                )}
              </p>
              {(window as any).__op15InstallerHandle && (
                <Button
                  onClick={async () => {
                    const fileHandle = (window as any).__op15InstallerHandle;
                    const execPlatform = (window as any).__op15InstallerPlatform || platform;
                    
                    if (fileHandle) {
                      setIsComplete(false);
                      setInstallStep("Executing installer...");
                      
                      // Try to execute
                      const executed = await executeInstallerInModal(fileHandle, execPlatform);
                      
                      if (executed) {
                        setInstallStep("Installation in progress. Waiting for agent to connect...");
                        // Polling will detect connection
                      } else {
                        // Execution attempted but may require user confirmation
                        setInstallStep("Please allow the installer to run when your browser prompts you. The installation will continue automatically.");
                        // Continue polling - if user allows execution, we'll detect connection
                      }
                    }
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                  size="lg"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Execute Installer Now
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                The installer will automatically configure and start the agent. You may be asked for your password to install the system service.
              </p>
            </div>
          )}
          
          {isComplete && isConnected && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md space-y-3">
              <p className="text-sm font-medium text-green-400">✅ Agent Connected!</p>
              <p className="text-sm text-muted-foreground">
                The agent is now running and connected. You can now use all features.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isComplete && isConnected ? (
            <Button 
              onClick={() => {
                onInstallComplete();
                onOpenChange(false);
              }}
              className="bg-green-500 hover:bg-green-600"
            >
              Done
            </Button>
          ) : isComplete ? (
            <Button 
              onClick={() => {
                onInstallComplete();
                onOpenChange(false);
              }}
              variant="outline"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isInstalling}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAuthorizeInstall}
                disabled={isInstalling}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Install Agent
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

