"use client";

import { useUser } from "@clerk/nextjs";
import { AgentAutoInstaller } from "./agent-auto-installer";
import { WorkspaceSelector } from "./workspace-selector";
import { AgentPermissionsPanel } from "./agent-permissions-panel";

interface LocalEnvConnectorProps {
  isCollapsed?: boolean;
}

export function LocalEnvConnector({ isCollapsed = false }: LocalEnvConnectorProps) {
  const { user, isLoaded } = useUser();
  
  // Always show local environment components (toggle removed)

  if (!isLoaded || !user) {
    return null;
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Workspace Root Selector - Always visible */}
      <WorkspaceSelector />
      
      {/* Agent Permissions Panel - Shows when agent is connected */}
      <AgentPermissionsPanel />
      
      {/* Agent Auto-Installer - Single source of truth for install/connection UI */}
      <AgentAutoInstaller />
    </div>
  );
}
