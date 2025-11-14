"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Settings, Home, Globe, FolderOpen, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RestrictionLevel } from "@/lib/types/user-context";

export function WorkspaceSelector() {
  const { user, isLoaded } = useUser();
  const [restrictionLevel, setRestrictionLevel] = useState<RestrictionLevel>("unrestricted");
  const [customPath, setCustomPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentRoot, setCurrentRoot] = useState("/");
  const [userHomeDirectory, setUserHomeDirectory] = useState<string | undefined>();
  const [showDropdown, setShowDropdown] = useState(false);

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
        setUserHomeDirectory(config.userHomeDirectory);
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
        setShowDropdown(false);
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

  const handleQuickSelect = (level: RestrictionLevel) => {
    setRestrictionLevel(level);
    if (level === "home" && userHomeDirectory) {
      setCustomPath(userHomeDirectory);
    } else if (level === "unrestricted") {
      setCustomPath("");
    }
    setShowDropdown(false);
  };

  if (!isLoaded || !user) {
    return null;
  }

  const restrictionOptions: Array<{
    level: RestrictionLevel;
    label: string;
    description: string;
    icon: React.ReactNode;
    path: string;
  }> = [
    {
      level: "unrestricted",
      label: "Unrestricted",
      description: "Full filesystem access",
      icon: <Globe className="h-4 w-4" />,
      path: "/",
    },
    {
      level: "home",
      label: "Home Directory",
      description: userHomeDirectory || "Your home directory",
      icon: <Home className="h-4 w-4" />,
      path: userHomeDirectory || "~",
    },
    {
      level: "custom",
      label: "Custom Directory",
      description: "Select a specific directory",
      icon: <FolderOpen className="h-4 w-4" />,
      path: customPath || "Enter path...",
    },
  ];

  const currentOption = restrictionOptions.find(opt => opt.level === restrictionLevel) || restrictionOptions[0];

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-foreground">Workspace Root</div>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowDropdown(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          title={isOpen ? "Close settings" : "Open settings"}
        >
          {isOpen ? <X className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
        </button>
      </div>

      {!isOpen ? (
        // Collapsed view - show current selection with dropdown
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2 py-1.5",
              "text-xs font-mono text-foreground",
              "bg-muted/50 hover:bg-muted rounded-md",
              "border border-border",
              "transition-colors"
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {currentOption.icon}
              <span className="truncate">{currentRoot}</span>
            </div>
            <ChevronDown className={cn(
              "h-3 w-3 shrink-0 transition-transform",
              showDropdown && "rotate-180"
            )} />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-background border border-border rounded-md shadow-lg overflow-hidden">
                {restrictionOptions.map((option) => (
                  <button
                    key={option.level}
                    onClick={() => handleQuickSelect(option.level)}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-2 text-left",
                      "hover:bg-muted transition-colors",
                      restrictionLevel === option.level && "bg-blue-500/10"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{option.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{option.label}</span>
                        {restrictionLevel === option.level && (
                          <Check className="h-3 w-3 text-blue-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {option.path}
                      </div>
                    </div>
                  </button>
                ))}
                <div className="border-t border-border">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setIsOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <Settings className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">Advanced settings...</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        // Expanded view - full settings
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span className="text-xs font-medium">{option.label}</span>
                    {restrictionLevel === option.level && (
                      <Check className="h-3 w-3 text-blue-500 shrink-0" />
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
              {userHomeDirectory && (
                <div className="text-xs text-muted-foreground">
                  Your home: <span className="font-mono">{userHomeDirectory}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || (restrictionLevel === "custom" && !customPath)}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs rounded-md font-medium",
                "bg-blue-500 text-white hover:bg-blue-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors"
              )}
            >
              {isSaving ? "Saving..." : "Save Changes"}
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
