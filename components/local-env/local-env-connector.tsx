"use client";

import { useUser } from "@clerk/nextjs";
import { AgentAutoInstaller } from "./agent-auto-installer";
import { WorkspaceSelector } from "./workspace-selector";

interface LocalEnvConnectorProps {
  isCollapsed?: boolean;
}

export function LocalEnvConnector({ isCollapsed = false }: LocalEnvConnectorProps) {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return null;
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Workspace Root Selector */}
      <WorkspaceSelector />
      
      <div className="h-px bg-border my-1" />
      
      {/* Agent Auto-Installer - Preferred method for local filesystem access */}
      <AgentAutoInstaller />
    </div>
  );
}

