"use client";

import { useUser } from "@clerk/nextjs";
import { Terminal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";
import { cn } from "@/lib/utils";

export function LocalEnvToggle() {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded, setEnabled } = useLocalEnvEnabled();

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
        onCheckedChange={setEnabled}
        className="shrink-0"
      />
    </div>
  );
}

