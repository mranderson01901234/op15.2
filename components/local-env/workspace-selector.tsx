"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Settings, Home, Globe, FolderOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RestrictionLevel } from "@/lib/types/user-context";

export function WorkspaceSelector() {
  const { user, isLoaded } = useUser();
  const [restrictionLevel, setRestrictionLevel] = useState<RestrictionLevel>("unrestricted");
  const [customPath, setCustomPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentRoot, setCurrentRoot] = useState("/");

  useEffect(() => {
    if (user && isLoaded) {
      loadWorkspaceConfig();
    }
  }, [user, isLoaded]);

  const loadWorkspaceConfig = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/users/${user.id}/workspace`);
      if (response.ok) {
        const config = await response.json();
        setRestrictionLevel(config.restrictionLevel || "unrestricted");
        setCurrentRoot(config.workspaceRoot || "/");
        setCustomPath(config.workspaceRoot || "");
      }
    } catch (error) {
      console.error("Failed to load workspace config:", error);
    }
  };

  const handleSave = async () => {
    if (!user || !isLoaded) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/users/${user.id}/workspace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restrictionLevel: restrictionLevel || "unrestricted",
          workspaceRoot:
            restrictionLevel === "custom" ? customPath : undefined,
        }),
      });

      if (response.ok) {
        const config = await response.json();
        setCurrentRoot(config.workspaceRoot);
        setIsOpen(false);
        // Small delay to ensure server has processed the save before reload
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to save workspace configuration: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Failed to save workspace config:", error);
      alert("Failed to save workspace configuration");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoaded || !user) {
    return null;
  }

  const restrictionOptions: Array<{
    level: RestrictionLevel;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      level: "unrestricted",
      label: "Unrestricted",
      description: "Full filesystem access (/)",
      icon: <Globe className="h-4 w-4" />,
    },
    {
      level: "home",
      label: "Home Directory",
      description: "Access to your home directory only",
      icon: <Home className="h-4 w-4" />,
    },
    {
      level: "custom",
      label: "Custom Directory",
      description: "Select a specific directory",
      icon: <FolderOpen className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Workspace Root</div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>

      {!isOpen ? (
        <div className="text-xs font-mono text-foreground truncate">
          {currentRoot}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {restrictionOptions.map((option) => (
              <label
                key={option.level}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-md cursor-pointer",
                  "border transition-colors",
                  restrictionLevel === option.level
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-border hover:bg-muted"
                )}
              >
                <input
                  type="radio"
                  name="restrictionLevel"
                  value={option.level}
                  checked={restrictionLevel === option.level}
                  onChange={(e) =>
                    setRestrictionLevel(e.target.value as RestrictionLevel)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span className="text-xs font-medium">{option.label}</span>
                    {restrictionLevel === option.level && (
                      <Check className="h-3 w-3 text-blue-500" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {restrictionLevel === "custom" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Custom Directory Path
              </label>
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/path/to/directory"
                className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || (restrictionLevel === "custom" && !customPath)}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs rounded-md",
                "bg-blue-500 text-white hover:bg-blue-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors"
              )}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                loadWorkspaceConfig(); // Reset to current config
              }}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

