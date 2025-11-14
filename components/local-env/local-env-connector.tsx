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
    <div className="flex flex-col gap-3 py-2">
      {/* Workspace Root Selector */}
      <div className="border-b border-border pb-3">
        <WorkspaceSelector />
      </div>
      
      {/* Agent Auto-Installer */}
      <div>
        <AgentAutoInstaller />
      </div>
    </div>
  );
}
