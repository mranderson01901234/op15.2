"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/infrastructure/connection-status";

interface AgentStatus {
  connected: boolean;
  userId: string;
  hasPermissions: boolean;
  mode: 'safe' | 'balanced' | 'unrestricted' | null;
  allowedDirectories: string[];
  allowedOperations: string[];
  isShuttingDown: boolean;
  httpApiAvailable?: boolean;
}

export function AgentPermissionsPanel() {
  const { user } = useUser();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const checkStatus = async () => {
    if (!user) return;
    
    try {
      // First check if agent is connected via status API
      const statusResponse = await fetch(`/api/users/${user.id}/agent-status`);
      if (!statusResponse.ok) {
        setStatus(null);
        setConnectionStatus("none");
        return;
      }
      
      const connectionInfo = await statusResponse.json();
      const newStatus: ConnectionStatus = connectionInfo.status || "none";
      setConnectionStatus(newStatus);
      
      // Only show panel if status is not "none"
      if (newStatus === "none") {
        setStatus(null);
        return;
      }
      
      // If HTTP API is available, get detailed status
      if (connectionInfo.httpHealth === "healthy" && connectionInfo.httpPort) {
        try {
          const response = await fetch(`/api/agent/permissions`);
          if (response.ok) {
            const agentStatus = await response.json();
            setStatus(agentStatus);
            return;
          }
        } catch (err) {
          // Fall through to use connection status
        }
      }
      
      // Fallback: use connection status (may not have permissions info)
      // At this point, newStatus is guaranteed to be "http-only" or "full" (not "none")
      setStatus({
        connected: true,
        userId: user.id,
        hasPermissions: connectionInfo.metadata?.hasPermissions || false,
        mode: connectionInfo.metadata?.mode || null,
        allowedDirectories: [],
        allowedOperations: [],
        isShuttingDown: false,
        httpApiAvailable: connectionInfo.httpHealth === "healthy",
      });
    } catch (err) {
      // Agent HTTP API not available
      setStatus(null);
      setConnectionStatus("none");
    }
  };

  useEffect(() => {
    if (user) {
      checkStatus();
      const interval = setInterval(checkStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const approvePermissions = async (mode: 'safe' | 'balanced' | 'unrestricted') => {
    if (!user || !status) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Get home directory from agent status API
      const metadataResponse = await fetch(`/api/users/${user.id}/agent-status`);
      if (!metadataResponse.ok) throw new Error('Failed to get agent info');
      
      const metadata = await metadataResponse.json();
      const homeDir = metadata.userHomeDirectory || '/home/user';
      
      // Determine allowed directories based on mode
      let allowedDirectories: string[] = [];
      let allowedOperations: ('read' | 'write' | 'delete' | 'exec')[] = [];
      
      if (mode === 'safe') {
        allowedDirectories = [homeDir];
        allowedOperations = ['read'];
      } else if (mode === 'balanced') {
        // Common directories
        allowedDirectories = [
          homeDir,
          `${homeDir}/Desktop`,
          `${homeDir}/Documents`,
          `${homeDir}/Downloads`,
          `${homeDir}/Projects`,
          '/tmp',
        ];
        allowedOperations = ['read', 'write', 'exec'];
      } else {
        // Unrestricted - allow everything
        allowedDirectories = [homeDir, '/tmp'];
        allowedOperations = ['read', 'write', 'delete', 'exec'];
      }
      
      // Use proxy API (avoids CORS)
      const response = await fetch(`/api/agent/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          allowedDirectories,
          allowedOperations,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      setSuccess(`Permissions approved! Mode: ${mode}`);
      setTimeout(() => {
        setSuccess(null);
        checkStatus();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve permissions');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  // Only show if agent is connected (status !== "none")
  if (connectionStatus === "none") {
    return null;
  }

  // Need status object to show permissions
  if (!status) {
    return null;
  }

  return (
    <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Agent Permissions</h3>
        {status.hasPermissions ? (
          <div className="flex items-center gap-1 text-green-500 text-xs">
            <CheckCircle className="h-3 w-3" />
            <span>Approved</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-yellow-500 text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>Not Approved</span>
          </div>
        )}
      </div>

      {status.hasPermissions ? (
        <div className="space-y-2 text-xs">
          <div>
            <span className="text-muted-foreground">Mode:</span>{' '}
            <span className="font-medium">{status.mode || 'unknown'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Allowed Operations:</span>{' '}
            <span className="font-medium">{status.allowedOperations.join(', ') || 'none'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Allowed Directories:</span>{' '}
            <span className="font-medium text-[10px]">
              {status.allowedDirectories.slice(0, 3).join(', ')}
              {status.allowedDirectories.length > 3 && ` +${status.allowedDirectories.length - 3} more`}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Approve permissions to allow the agent to execute operations:
          </p>
          
          <PermissionModeDropdown
            onSelect={approvePermissions}
            disabled={loading}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 p-2 rounded">
          <XCircle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-xs text-green-500 bg-green-500/10 p-2 rounded">
          <CheckCircle className="h-3 w-3" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}

interface PermissionModeDropdownProps {
  onSelect: (mode: 'safe' | 'balanced' | 'unrestricted') => void;
  disabled?: boolean;
}

function PermissionModeDropdown({ onSelect, disabled }: PermissionModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const modes: Array<{
    value: 'safe' | 'balanced' | 'unrestricted';
    label: string;
    description: string;
  }> = [
    {
      value: 'safe',
      label: 'Safe',
      description: 'Read-only operations',
    },
    {
      value: 'balanced',
      label: 'Balanced',
      description: 'Read/write/exec in common directories',
    },
    {
      value: 'unrestricted',
      label: 'Unrestricted',
      description: 'Full access (use with caution)',
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (mode: 'safe' | 'balanced' | 'unrestricted') => {
    onSelect(mode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2",
          "text-xs bg-background border border-border rounded-md",
          "hover:bg-muted transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="text-muted-foreground">Select mode...</span>
        <ChevronDown className={cn(
          "h-3 w-3 text-muted-foreground transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full z-50 bg-background border border-border rounded-md shadow-lg overflow-hidden">
          {modes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              disabled={disabled}
              className={cn(
                "w-full flex flex-col items-start gap-1 px-3 py-2.5 text-left",
                "hover:bg-muted transition-colors",
                "text-xs",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="font-medium">{mode.label}</span>
              <span className="text-[10px] text-muted-foreground">{mode.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

