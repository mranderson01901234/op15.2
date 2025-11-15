"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";

export function AgentStatusFooter() {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded } = useLocalEnvEnabled();
  const [isConnected, setIsConnected] = useState(false);
  const [userHomeDirectory, setUserHomeDirectory] = useState<string | undefined>();

  useEffect(() => {
    if (user && isLoaded && isEnabled) {
      checkAgentStatus();
      // Check status periodically
      const interval = setInterval(checkAgentStatus, 10000); // Check every 10 seconds
      return () => clearInterval(interval);
    } else {
      setIsConnected(false);
    }
  }, [user, isLoaded, isEnabled]);

  const checkAgentStatus = async () => {
    if (!user || !isEnabled) return;
    
    try {
      const response = await fetch(`/api/users/${user.id}/workspace`);
      if (response.ok) {
        const config = await response.json();
        if (config.userHomeDirectory) {
          setIsConnected(true);
          setUserHomeDirectory(config.userHomeDirectory);
        } else {
          setIsConnected(false);
        }
      }
    } catch (err) {
      setIsConnected(false);
    }
  };

  if (!isLoaded || !user || !toggleLoaded || !isEnabled || !isConnected) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground border-t border-border">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
        <Terminal className="h-3 w-3 shrink-0" />
        <span className="truncate">Agent Connected</span>
      </div>
    </div>
  );
}

