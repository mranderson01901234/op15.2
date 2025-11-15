"use client";

import { useUser } from "@clerk/nextjs";
import { AgentAutoInstaller } from "./agent-auto-installer";
import { WorkspaceSelector } from "./workspace-selector";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";

interface LocalEnvConnectorProps {
  isCollapsed?: boolean;
}

export function LocalEnvConnector({ isCollapsed = false }: LocalEnvConnectorProps) {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded } = useLocalEnvEnabled();

  if (!isLoaded || !user || !toggleLoaded) {
    return null;
  }

  if (isCollapsed) {
    return null;
  }

  // Don't render local environment components if disabled
  if (!isEnabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Workspace Root Selector - Always visible */}
      <WorkspaceSelector />
      
      {/* Agent Auto-Installer - Only shows when not connected */}
      <AgentAutoInstaller />
    </div>
  );
}
