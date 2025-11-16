"use client";

import { useState, useEffect, useRef, useCallback, type ReactElement } from "react";
import { useUser } from "@clerk/nextjs";
import { Settings, Home, Globe, FolderOpen, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RestrictionLevel } from "@/lib/types/user-context";
import { useLocalEnvEnabled } from "@/hooks/use-local-env-enabled";

interface DirectorySuggestion {
  name: string;
  path: string;
}

export function WorkspaceSelector() {
  const { user, isLoaded } = useUser();
  const { isEnabled, isLoaded: toggleLoaded } = useLocalEnvEnabled();
  const [restrictionLevel, setRestrictionLevel] = useState<RestrictionLevel>("unrestricted");
  const [customPath, setCustomPath] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentRoot, setCurrentRoot] = useState<string>(""); // Empty initially, will be loaded from API
  const [userHomeDirectory, setUserHomeDirectory] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true); // Track loading state
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editablePath, setEditablePath] = useState("");
  const [suggestions, setSuggestions] = useState<DirectorySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showDirectoryDropdown, setShowDirectoryDropdown] = useState(false);
  const [navigationPath, setNavigationPath] = useState<string[]>([]); // Track navigation path for drill-down
  const [nestedDirectories, setNestedDirectories] = useState<Map<string, DirectorySuggestion[]>>(new Map()); // Store subdirectories for each path
  const [hoveredSuggestionPath, setHoveredSuggestionPath] = useState<string | null>(null);
  const [hoveredSubdirectories, setHoveredSubdirectories] = useState<DirectorySuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const enterPressedRef = useRef<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadWorkspaceConfig = useCallback(async () => {
    if (!user) return;

    try {
      // Use cache: 'no-store' to ensure we always get the latest workspace config
      const response = await fetch(`/api/users/${user.id}/workspace`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const config = await response.json();
        const restrictionLevel = config.restrictionLevel || "unrestricted";
        const userHomeDirectory = config.userHomeDirectory;
        
        // Determine the workspace root based on restriction level
        let workspaceRoot = '/';
        if (restrictionLevel === 'home') {
          workspaceRoot = userHomeDirectory || '/';
        } else if (restrictionLevel === 'custom') {
          workspaceRoot = config.workspaceRoot || '/';
        } else {
          // unrestricted
          workspaceRoot = '/';
        }
        
        console.log('Loaded workspace config:', {
          restrictionLevel,
          workspaceRoot,
          userHomeDirectory,
          configWorkspaceRoot: config.workspaceRoot,
        });
        
        // Update all state with the loaded config
        setRestrictionLevel(restrictionLevel);
        setCurrentRoot(workspaceRoot);
        setCustomPath(restrictionLevel === 'custom' ? workspaceRoot : '');
        setEditablePath(workspaceRoot);
        setUserHomeDirectory(userHomeDirectory);
      } else {
        console.error('Failed to load workspace config:', response.status, response.statusText);
      }
    } catch (error) {
      console.error("Failed to load workspace config:", error);
    }
  }, [user]);

  useEffect(() => {
    if (user && isLoaded && isEnabled && toggleLoaded) {
      setIsLoading(true);
      loadWorkspaceConfig().finally(() => {
        setIsLoading(false);
      });
    } else if (!user && isLoaded) {
      // User is signed out, reset to defaults
      setIsLoading(false);
      setCurrentRoot("/");
      setRestrictionLevel("unrestricted");
      setCustomPath("");
      setEditablePath("/");
    } else if (!isEnabled && toggleLoaded) {
      // Local environment disabled, reset to defaults
      setIsLoading(false);
      setCurrentRoot("/");
      setRestrictionLevel("unrestricted");
      setCustomPath("");
      setEditablePath("/");
    }
  }, [user, isLoaded, isEnabled, toggleLoaded, loadWorkspaceConfig]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    // Update editablePath when currentRoot changes and not editing
    // Only update if currentRoot has a value (not empty/loading state)
    if (!isEditing && currentRoot) {
      setEditablePath(currentRoot);
    }
  }, [currentRoot, isEditing]);

  // Cleanup hover timeout when component unmounts or suggestions are hidden
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Clear navigation path when dropdown is closed
  useEffect(() => {
    if (!showDirectoryDropdown) {
      setNavigationPath([]);
      setNestedDirectories(new Map());
    }
  }, [showDirectoryDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Scroll selected suggestion into view when navigating with keyboard
    if (
      selectedSuggestionIndex >= 0 &&
      suggestionsRef.current &&
      showSuggestions
    ) {
      const buttons = suggestionsRef.current.querySelectorAll("button");
      const selectedButton = buttons[selectedSuggestionIndex] as HTMLElement;
      if (selectedButton) {
        selectedButton.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [selectedSuggestionIndex, showSuggestions]);

  const sortDirectoriesByPriority = (dirs: DirectorySuggestion[]): DirectorySuggestion[] => {
    // Common directory names to prioritize (case-insensitive)
    const commonDirs = [
      'home',
      'desktop',
      'documents',
      'downloads',
      'projects',
      'workspace',
      'code',
      'dev',
      'development',
      'work',
      'src',
      'source',
      'repos',
      'repositories',
    ];

    return [...dirs].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      // Extract directory name from path (last segment)
      const aDirName = a.path.split('/').filter(Boolean).pop()?.toLowerCase() || aName;
      const bDirName = b.path.split('/').filter(Boolean).pop()?.toLowerCase() || bName;
      
      const aIndex = commonDirs.findIndex(dir => aDirName === dir || aDirName.includes(dir));
      const bIndex = commonDirs.findIndex(dir => bDirName === dir || bDirName.includes(dir));
      
      // If both are common, maintain their priority order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only a is common, it comes first
      if (aIndex !== -1) {
        return -1;
      }
      // If only b is common, it comes first
      if (bIndex !== -1) {
        return 1;
      }
      // Neither is common, maintain original order
      return 0;
    });
  };

  const fetchDirectorySuggestions = async (path: string) => {
    if (!path || path === "/") {
      // Fetch root directories
      try {
        const response = await fetch("/api/filesystem/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "/", depth: 0 }),
        });
        if (response.ok) {
          const data = await response.json();
          const dirs = (data.entries || [])
            .filter((entry: { kind: string; name: string; path: string }) => {
              // Only include entries that are explicitly directories
              if (entry.kind !== "directory") {
                return false;
              }
              // Exclude bundle directories and file-like packages (e.g., .xcodeproj, .app, .framework)
              const name = entry.name.toLowerCase();
              const bundleExtensions = ['.xcodeproj', '.xcworkspace', '.app', '.framework', '.bundle', '.dmg', '.pkg'];
              const hasBundleExtension = bundleExtensions.some(ext => name.endsWith(ext));
              if (hasBundleExtension) {
                return false;
              }
              // Exclude entries with common file extensions (but allow dotfiles/dot directories)
              const hasFileExtension = /\.[a-zA-Z0-9]{1,5}$/.test(entry.name) && 
                !entry.name.match(/^\./); // Allow dotfiles/dot directories like .git, .github
              return !hasFileExtension;
            })
            .map((entry: { name: string; path: string }) => ({
              name: entry.name,
              path: entry.path,
            }));
          // Sort directories to prioritize common ones
          const sortedDirs = sortDirectoriesByPriority(dirs);
          setSuggestions(sortedDirs);
          setShowSuggestions(sortedDirs.length > 0);
        }
      } catch (error) {
        console.error("Failed to fetch root directories:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
      return;
    }

    // Check if path ends with / - if so, show all directories in that path
    const endsWithSlash = path.endsWith("/");
    const normalizedPath = endsWithSlash ? path.slice(0, -1) : path;
    const lastSlashIndex = normalizedPath.lastIndexOf("/");
    
    let parentDir: string;
    let partialName: string;
    
    if (endsWithSlash) {
      // Path ends with /, so list directories in that directory
      parentDir = normalizedPath || "/";
      partialName = "";
    } else if (lastSlashIndex === -1) {
      // No slash found, search in root
      parentDir = "/";
      partialName = normalizedPath;
    } else {
      // Normal case: get parent directory and partial name
      parentDir = normalizedPath.substring(0, lastSlashIndex) || "/";
      partialName = normalizedPath.substring(lastSlashIndex + 1);
    }

    try {
      const response = await fetch("/api/filesystem/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: parentDir, depth: 0 }),
      });

      if (response.ok) {
        const data = await response.json();
        let dirs = (data.entries || [])
          .filter((entry: { kind: string; name: string; path: string }) => {
            // Only include entries that are explicitly directories
            if (entry.kind !== "directory") {
              return false;
            }
            // Exclude bundle directories and file-like packages (e.g., .xcodeproj, .app, .framework)
            const name = entry.name.toLowerCase();
            const bundleExtensions = ['.xcodeproj', '.xcworkspace', '.app', '.framework', '.bundle', '.dmg', '.pkg'];
            const hasBundleExtension = bundleExtensions.some(ext => name.endsWith(ext));
            if (hasBundleExtension) {
              return false;
            }
            // Exclude entries with common file extensions (but allow dotfiles/dot directories)
            const hasFileExtension = /\.[a-zA-Z0-9]{1,5}$/.test(entry.name) && 
              !entry.name.match(/^\./); // Allow dotfiles/dot directories like .git, .github
            return !hasFileExtension;
          });

        // Filter by partial name if we have one
        if (partialName.length > 0) {
          dirs = dirs.filter((entry: { name: string }) =>
            entry.name.toLowerCase().startsWith(partialName.toLowerCase())
          );
        }

        dirs = dirs.map((entry: { name: string; path: string }) => ({
          name: entry.name,
          path: entry.path,
        }));

        // Sort directories to prioritize common ones
        const sortedDirs = sortDirectoriesByPriority(dirs);
        setSuggestions(sortedDirs);
        // Show suggestions if we have directories
        // Always show if we have results, regardless of partial name (user might be typing)
        const shouldShow = sortedDirs.length > 0;
        console.log("Suggestions fetched:", { 
          path, 
          parentDir, 
          partialName, 
          dirsCount: sortedDirs.length, 
          shouldShow,
          suggestions: sortedDirs 
        });
        setShowSuggestions(shouldShow);
        setSelectedSuggestionIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Failed to fetch directory suggestions:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handlePathChange = (value: string) => {
    setEditablePath(value);
    setCurrentRoot(value);
    setCustomPath(value);
    
    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Debounce the suggestion fetch
    debounceTimeoutRef.current = setTimeout(() => {
      console.log("Fetching suggestions for:", value);
      fetchDirectorySuggestions(value);
    }, 200);
  };

  const handleSuggestionHover = async (suggestion: DirectorySuggestion) => {
    const index = suggestions.findIndex(s => s.path === suggestion.path);
    if (index >= 0) {
      setSelectedSuggestionIndex(index);
    }
    
    // Fetch subdirectories for hovered suggestion
    setHoveredSuggestionPath(suggestion.path);
    
    // Check if we already have subdirectories cached
    if (nestedDirectories.has(suggestion.path)) {
      setHoveredSubdirectories(nestedDirectories.get(suggestion.path) || []);
      return;
    }
    
    // Fetch subdirectories
    try {
      const response = await fetch("/api/filesystem/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: suggestion.path, depth: 0 }),
      });

      if (response.ok) {
        const data = await response.json();
        const subdirs = (data.entries || [])
          .filter((entry: { kind: string; name: string; path: string }) => {
            if (entry.kind !== "directory") return false;
            const name = entry.name.toLowerCase();
            const bundleExtensions = ['.xcodeproj', '.xcworkspace', '.app', '.framework', '.bundle', '.dmg', '.pkg'];
            const hasBundleExtension = bundleExtensions.some(ext => name.endsWith(ext));
            if (hasBundleExtension) return false;
            const hasFileExtension = /\.[a-zA-Z0-9]{1,5}$/.test(entry.name) && !entry.name.match(/^\./);
            if (hasFileExtension) return false;
            return true;
          })
          .map((entry: { name: string; path: string }) => ({
            name: entry.name,
            path: entry.path,
          }));
        
        // Cache subdirectories
        setNestedDirectories(prev => new Map(prev).set(suggestion.path, subdirs));
        setHoveredSubdirectories(subdirs);
      }
    } catch (error) {
      console.error("Error fetching subdirectories:", error);
      setHoveredSubdirectories([]);
    }
  };

  const handleSuggestionLeave = () => {
    // Keep the selected index on leave - allows keyboard navigation to work
    // setSelectedSuggestionIndex(-1);
    // Clear hovered state after a delay to allow moving to subdirectory dropdown
    setTimeout(() => {
      setHoveredSuggestionPath(null);
      setHoveredSubdirectories([]);
    }, 200);
  };

  const handleSuggestionSelect = (suggestion: DirectorySuggestion, shouldSave: boolean = false) => {
    setEditablePath(suggestion.path);
    setCurrentRoot(suggestion.path);
    setCustomPath(suggestion.path);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setRestrictionLevel("custom");
    
    if (shouldSave) {
      setIsEditing(false);
      handleSave("custom", suggestion.path);
    }
  };

  const handleNavigateIntoDirectory = async (suggestion: DirectorySuggestion) => {
    // Navigate into directory without saving - update path and show subdirectories
    setEditablePath(suggestion.path);
    setCurrentRoot(suggestion.path);
    setCustomPath(suggestion.path);
    setRestrictionLevel("custom");
    setSelectedSuggestionIndex(-1);
    
    // Fetch subdirectories of the selected directory
    await fetchDirectorySuggestions(suggestion.path + "/");
    setShowSuggestions(true);
  };

  const handleDirectoryClick = async (suggestion: DirectorySuggestion, isNested: boolean = false) => {
    // Navigate into the directory - add it to navigation path and fetch its subdirectories
    // Normalize path: ensure no trailing slash (except for root "/")
    let pathToFetch = suggestion.path.trim();
    if (pathToFetch !== "/" && pathToFetch.endsWith("/")) {
      pathToFetch = pathToFetch.slice(0, -1);
    }
    
    // Check if we already have subdirectories cached
    if (nestedDirectories.has(pathToFetch)) {
      // Already have subdirectories, just update navigation path
      if (isNested) {
        setNavigationPath([...navigationPath, pathToFetch]);
      } else {
        setNavigationPath([pathToFetch]);
      }
      return;
    }
    
    // Fetch subdirectories - API handles paths with or without trailing slash
    try {
      const response = await fetch("/api/filesystem/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathToFetch, depth: 0 }),
      });

      if (response.ok) {
        const data = await response.json();
        const subdirs = (data.entries || [])
          .filter((entry: { kind: string; name: string; path: string }) => {
            if (entry.kind !== "directory") return false;
            const name = entry.name.toLowerCase();
            const bundleExtensions = ['.xcodeproj', '.xcworkspace', '.app', '.framework', '.bundle', '.dmg', '.pkg'];
            const hasBundleExtension = bundleExtensions.some(ext => name.endsWith(ext));
            if (hasBundleExtension) return false;
            const hasFileExtension = /\.[a-zA-Z0-9]{1,5}$/.test(entry.name) && !entry.name.match(/^\./);
            return !hasFileExtension;
          })
          .map((entry: { name: string; path: string }) => ({
            name: entry.name,
            path: entry.path,
          }));

        // Sort subdirectories by priority
        const sortedSubdirs = sortDirectoriesByPriority(subdirs);
        
        // Cache the subdirectories
        setNestedDirectories(prev => new Map(prev).set(pathToFetch, sortedSubdirs));
        
        // Update navigation path
        if (isNested) {
          setNavigationPath([...navigationPath, pathToFetch]);
        } else {
          setNavigationPath([pathToFetch]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch subdirectories:", error);
    }
  };
  
  const handleNavigateBack = () => {
    // Navigate back one level
    if (navigationPath.length > 0) {
      setNavigationPath(navigationPath.slice(0, -1));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        setIsEditing(false);
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        
        // Get the current value directly from the input field
        const inputValue = (e.target as HTMLInputElement).value;
        const pathToSave = inputValue.trim();
        
        inputRef.current?.blur(); // Remove focus to remove blue border
        
        // Always save if there's a valid path (non-empty)
        if (pathToSave !== "") {
          console.log('Saving workspace root on Enter:', pathToSave);
          // Update both state variables to keep them in sync
          setEditablePath(pathToSave);
          setCustomPath(pathToSave);
          // Save the workspace root
          handleSave("custom", pathToSave);
        } else {
          // No valid path, just reset to current root
          setEditablePath(currentRoot);
          setCustomPath(currentRoot);
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
        setEditablePath(currentRoot);
        setCustomPath(currentRoot);
        setShowSuggestions(false);
      }
      // Allow Tab to work normally when there are no suggestions
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        enterPressedRef.current = false; // Clear enter flag on other navigation
        setSelectedSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        enterPressedRef.current = false; // Clear enter flag on other navigation
        setSelectedSuggestionIndex((prev) => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Tab":
        e.preventDefault();
        enterPressedRef.current = false; // Clear enter flag on tab navigation
        if (e.shiftKey) {
          // Shift+Tab: move to previous suggestion
          setSelectedSuggestionIndex((prev) => 
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
        } else {
          // Tab: move to next suggestion
          setSelectedSuggestionIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case "Enter":
        e.preventDefault();
        // If user hasn't tabbed to select a suggestion, save the current path
        if (selectedSuggestionIndex === -1) {
          setIsEditing(false);
          setShowSuggestions(false);
          setSelectedSuggestionIndex(-1);
          
          // Get the current value directly from the input field
          const inputValue = (e.target as HTMLInputElement).value;
          const pathToSave = inputValue.trim();
          
          inputRef.current?.blur(); // Remove focus to remove blue border
          
          // Always save if there's a valid path (non-empty)
          if (pathToSave !== "") {
            console.log('Saving workspace root on Enter (with suggestions open):', pathToSave);
            // Update both state variables to keep them in sync
            setEditablePath(pathToSave);
            setCustomPath(pathToSave);
            // Save the workspace root
            handleSave("custom", pathToSave);
          } else {
            setEditablePath(currentRoot);
            setCustomPath(currentRoot);
          }
          enterPressedRef.current = false;
          return;
        }
        
        // Check if Enter was just pressed (double Enter detection)
        if (enterPressedRef.current) {
          // Double Enter: save and finalize the selected suggestion
          enterPressedRef.current = false;
          setShowSuggestions(false);
          inputRef.current?.blur(); // Remove focus to remove blue border
          if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
            // Select and save the highlighted suggestion
            handleSuggestionSelect(suggestions[selectedSuggestionIndex], true);
          }
        } else {
          // Single Enter: navigate into the selected directory without saving
          enterPressedRef.current = true;
          if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
            handleNavigateIntoDirectory(suggestions[selectedSuggestionIndex]);
          }
          // Clear enter flag after a delay to detect double Enter
          setTimeout(() => {
            enterPressedRef.current = false;
          }, 500);
        }
        break;
      case "Escape":
        e.preventDefault();
        enterPressedRef.current = false; // Clear enter flag
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };


  const handleQuickSelect = async (level: RestrictionLevel) => {
    setRestrictionLevel(level);
    setShowSettingsDropdown(false);
    if (level === "home" && userHomeDirectory) {
      setCustomPath(userHomeDirectory);
      // Auto-save home directory selection
      await handleSave(level, userHomeDirectory);
    } else if (level === "unrestricted") {
      setCustomPath("");
      // Auto-save unrestricted selection
      await handleSave(level, undefined);
    } else if (level === "custom") {
      // For custom, open the expanded view to allow path editing
      setIsOpen(true);
      return;
    }
  };

  const handleSave = async (level?: RestrictionLevel, path?: string) => {
    if (!user || !isLoaded) return;

    const finalLevel = level || restrictionLevel;
    const finalPath = path !== undefined ? path : (finalLevel === "custom" ? customPath : undefined);

    // Validate that if custom level is selected, we have a valid path
    if (finalLevel === "custom" && (!finalPath || finalPath.trim() === "")) {
      alert("Please enter a valid directory path");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/users/${user.id}/workspace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restrictionLevel: finalLevel || "unrestricted",
          workspaceRoot: finalLevel === "custom" ? finalPath?.trim() : undefined,
        }),
      });

      if (response.ok) {
        const config = await response.json();
        console.log('Workspace config saved successfully:', config);
        
        // Update local state immediately
        setCurrentRoot(config.workspaceRoot);
        setEditablePath(config.workspaceRoot);
        setIsOpen(false);
        setShowSettingsDropdown(false);
        
        // Emit custom event to notify all components that workspace root has changed
        // This ensures the LLM always has the latest workspace root
        window.dispatchEvent(new CustomEvent('workspaceRootChanged', {
          detail: {
            workspaceRoot: config.workspaceRoot,
            restrictionLevel: config.restrictionLevel,
            userHomeDirectory: config.userHomeDirectory,
          }
        }));
        
        // Verify the save by fetching the workspace config again after a short delay
        // This ensures the server has processed the save before reloading
        setTimeout(async () => {
          try {
            const verifyResponse = await fetch(`/api/users/${user.id}/workspace`, {
              cache: 'no-store',
            });
            if (verifyResponse.ok) {
              const verifiedConfig = await verifyResponse.json();
              console.log('Verified workspace config:', verifiedConfig);
              if (verifiedConfig.workspaceRoot !== config.workspaceRoot) {
                console.warn('Workspace root mismatch after save:', {
                  saved: config.workspaceRoot,
                  verified: verifiedConfig.workspaceRoot
                });
              }
            }
          } catch (verifyError) {
            console.error('Failed to verify workspace config:', verifyError);
          }
          // Reload page to ensure all components have the latest workspace root
          window.location.reload();
        }, 200);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to save workspace config:', errorData);
        alert(`Failed to save workspace configuration: ${errorData.error || 'Unknown error'}`);
        setIsSaving(false);
      }
    } catch (error) {
      console.error("Failed to save workspace config:", error);
      alert("Failed to save workspace configuration. Please try again.");
      setIsSaving(false);
    }
  };

  if (!isLoaded || !user || !toggleLoaded || !isEnabled) {
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
    <div className="flex flex-col gap-2 px-1 py-2 w-full">
      <div className="flex items-center justify-between px-2">
        <div className="text-xs font-medium text-foreground">Workspace Root</div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isOpen) {
                setIsOpen(false);
                setShowSettingsDropdown(false);
              } else {
                setShowSettingsDropdown(!showSettingsDropdown);
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            title={isOpen ? "Close settings" : "Open settings"}
          >
            {isOpen ? <X className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
          </button>
          
          {/* Settings dropdown with restriction level options */}
          {showSettingsDropdown && !isOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowSettingsDropdown(false)}
              />
              <div className="absolute top-full right-0 mt-1 z-20 bg-background border border-blue-500/20 rounded-md shadow-lg overflow-hidden min-w-[200px]">
                {restrictionOptions.map((option) => (
                  <button
                    key={option.level}
                    onClick={() => handleQuickSelect(option.level)}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-2.5 text-left",
                      "hover:bg-blue-500/10 transition-colors",
                      restrictionLevel === option.level && "bg-blue-500/10 border-l-2 border-l-blue-500"
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
                      <div className="text-xs text-muted-foreground mt-1 font-mono break-words">
                        {option.path}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!isOpen ? (
        // Collapsed view - show editable input with autocomplete
        <div className="relative w-full">
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="text"
              value={isLoading ? "" : editablePath}
              readOnly={!isEditing || isLoading}
              onChange={(e) => handlePathChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={() => {
                if (!isEditing && !isLoading) {
                  setIsEditing(true);
                  setEditablePath(currentRoot);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }
              }}
              onFocus={() => {
                if (!isEditing && !isLoading) {
                  setIsEditing(true);
                  setEditablePath(currentRoot);
                }
                // Fetch suggestions when input is focused
                if (editablePath && !isLoading) {
                  fetchDirectorySuggestions(editablePath);
                }
              }}
              onBlur={() => {
                // Delay to allow suggestion clicks
                setTimeout(() => {
                  setIsEditing(false);
                  // Don't close directory dropdown on blur if it's open
                  if (!showDirectoryDropdown) {
                    setShowSuggestions(false);
                  }
                  if (editablePath && editablePath !== currentRoot && !isLoading) {
                    handleSave("custom", editablePath);
                  } else {
                    setEditablePath(currentRoot);
                  }
                }, 200);
              }}
              className={cn(
                "w-full box-border px-3 py-2 pr-8 text-xs font-mono",
                "bg-background border border-border rounded-md",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                !isEditing && "cursor-pointer",
                isLoading && "opacity-50 cursor-wait"
              )}
              placeholder={isLoading ? "Loading..." : "/path/to/directory"}
              disabled={isLoading}
              style={{ minHeight: '2.25rem' }}
            />
            {/* Always visible dropdown icon */}
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!isLoading && currentRoot) {
                  if (showDirectoryDropdown) {
                    // Close dropdown
                    setShowDirectoryDropdown(false);
                    setShowSuggestions(false);
                  } else {
                    // Fetch subdirectories of current workspace root
                    const pathToFetch = currentRoot.endsWith('/') ? currentRoot : currentRoot + '/';
                    await fetchDirectorySuggestions(pathToFetch);
                    setShowDirectoryDropdown(true);
                    setShowSuggestions(true);
                  }
                }
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 p-0.5 hover:bg-muted/50 rounded cursor-pointer z-10"
              title="Show subdirectories"
              disabled={isLoading || !currentRoot}
            >
              <ChevronDown className={cn(
                "h-3 w-3 transition-transform text-muted-foreground",
                showDirectoryDropdown && "rotate-180"
              )} />
            </button>
          </div>
          
          {/* Directory dropdown - shows subdirectories of current workspace root */}
          {showDirectoryDropdown && showSuggestions && suggestions.length > 0 && (
            <>
              <div 
                className="fixed inset-0 z-25" 
                onClick={() => {
                  setShowDirectoryDropdown(false);
                  setShowSuggestions(false);
                }}
              />
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 mt-1 z-30 bg-background border border-border rounded-md shadow-lg max-h-[50vh] overflow-y-auto min-w-full w-max max-w-[90vw] flex"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Render nested dropdowns based on navigation path - click to navigate */}
                {(() => {
                  const renderDirectoryLevel = (
                    dirs: DirectorySuggestion[],
                    level: number
                  ): ReactElement => {
                    return (
                      <div
                        key={`level-${level}`}
                        className={cn(
                          "bg-background border border-border rounded-md shadow-lg min-w-[200px] max-w-[400px] max-h-[50vh] overflow-y-auto",
                          level > 0 && "absolute left-full top-0 ml-1 z-40"
                        )}
                      >
                        {/* Back button if not at root level */}
                        {level > 0 && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleNavigateBack();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors text-xs font-mono border-b border-border"
                          >
                            <ChevronDown className="h-3 w-3 rotate-90 text-muted-foreground" />
                            <span className="text-muted-foreground">Back</span>
                          </button>
                        )}
                        
                        {dirs.map((dir) => {
                          const subdirs = nestedDirectories.get(dir.path) || [];
                          const isSelected = navigationPath[level] === dir.path;
                          
                          return (
                            <div key={dir.path} className="relative">
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // Fetch subdirectories and navigate into this directory
                                  await handleDirectoryClick(dir, level > 0);
                                  // After a brief delay, check if subdirectories were found
                                  setTimeout(() => {
                                    const fetchedSubdirs = nestedDirectories.get(dir.path) || [];
                                    if (fetchedSubdirs.length === 0) {
                                      // No subdirectories found, select this directory as workspace root
                                      handleSuggestionSelect(dir, true);
                                      setShowDirectoryDropdown(false);
                                      setShowSuggestions(false);
                                    }
                                    // If subdirectories exist, nested dropdown will show automatically
                                  }, 150);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                                  "hover:bg-muted transition-colors",
                                  "text-xs font-mono",
                                  isSelected && "bg-blue-500/30 border-l-2 border-l-blue-500"
                                )}
                              >
                                <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="whitespace-nowrap flex-1">{dir.path}</span>
                                {subdirs.length > 0 && (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground rotate-[-90deg]" />
                                )}
                              </button>
                              
                              {/* Show nested dropdown to the right if this directory is clicked and has subdirectories */}
                              {isSelected && subdirs.length > 0 && (
                                <div className="absolute left-full top-0 ml-1 z-50">
                                  {renderDirectoryLevel(subdirs, level + 1)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  };
                  
                  return renderDirectoryLevel(suggestions, 0);
                })()}
              </div>
            </>
          )}
          
          {/* Directory suggestions dropdown - for autocomplete when typing */}
          {!showDirectoryDropdown && showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 mt-1 z-30 bg-background border border-border rounded-md shadow-lg max-h-[50vh] overflow-y-auto min-w-full w-max max-w-[90vw] flex"
            >
              <div className="flex-1 min-w-0">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.path}
                    className="relative"
                    onMouseEnter={() => handleSuggestionHover(suggestion)}
                    onMouseLeave={handleSuggestionLeave}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSuggestionSelect(suggestion, true);
                      }}
                      onMouseDown={(e) => {
                        // Prevent input blur when clicking suggestion
                        e.preventDefault();
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left",
                        "hover:bg-muted transition-colors",
                        "text-xs font-mono",
                        index === selectedSuggestionIndex && "bg-blue-500/30 border-l-2 border-l-blue-500",
                        hoveredSuggestionPath === suggestion.path && "bg-muted"
                      )}
                    >
                      <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="whitespace-nowrap">{suggestion.path}</span>
                    </button>
                    
                    {/* Subdirectories dropdown on hover - appears automatically to the right */}
                    {hoveredSuggestionPath === suggestion.path && hoveredSubdirectories.length > 0 && (
                      <div
                        data-subdirectory-dropdown
                        className="absolute left-full top-0 ml-1 bg-background border border-border rounded-md shadow-lg min-w-[200px] max-w-[400px] max-h-[50vh] overflow-y-auto z-40"
                        onMouseEnter={() => {
                          // Keep subdirectories visible when hovering over them
                          // Clear any pending timeout that would hide the dropdown
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                        }}
                        onMouseLeave={() => {
                          // When leaving subdirectory dropdown, clear hover state
                          setHoveredSuggestionPath(null);
                          setHoveredSubdirectories([]);
                        }}
                      >
                        {hoveredSubdirectories.map((subdir) => (
                          <button
                            key={subdir.path}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSuggestionSelect(subdir, true);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-left",
                              "hover:bg-muted transition-colors",
                              "text-xs font-mono"
                            )}
                          >
                            <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="whitespace-nowrap">{subdir.path}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
                    : "border-border hover:bg-blue-500/10 hover:border-blue-500/20"
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
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={customPath}
                  onChange={(e) => {
                    setCustomPath(e.target.value);
                    handlePathChange(e.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    setIsEditing(true);
                    if (customPath) {
                      fetchDirectorySuggestions(customPath);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowSuggestions(false);
                    }, 200);
                  }}
                  placeholder="/path/to/directory"
                  className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Suggestions dropdown for expanded view */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 mt-1 z-30 bg-background border border-border rounded-md shadow-lg max-h-[50vh] overflow-y-auto min-w-full w-max max-w-[90vw] flex"
                  >
                    <div className="flex-1 min-w-0">
                      {suggestions.map((suggestion, index) => (
                        <div
                          key={suggestion.path}
                          className="relative"
                          onMouseEnter={() => handleSuggestionHover(suggestion)}
                          onMouseLeave={handleSuggestionLeave}
                        >
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCustomPath(suggestion.path);
                              handleSuggestionSelect(suggestion);
                            }}
                            onMouseDown={(e) => {
                              // Prevent input blur when clicking suggestion
                              e.preventDefault();
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-left",
                              "hover:bg-muted transition-colors",
                              "text-xs font-mono",
                              index === selectedSuggestionIndex && "bg-blue-500/30 border-l-2 border-l-blue-500",
                              hoveredSuggestionPath === suggestion.path && "bg-muted"
                            )}
                          >
                            <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="whitespace-nowrap">{suggestion.path}</span>
                            {hoveredSuggestionPath === suggestion.path && hoveredSubdirectories.length > 0 && (
                              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
                            )}
                          </button>
                          
                          {/* Subdirectories dropdown on hover */}
                          {hoveredSuggestionPath === suggestion.path && hoveredSubdirectories.length > 0 && (
                            <div
                              data-subdirectory-dropdown
                              className="absolute left-full top-0 ml-1 bg-background border border-border rounded-md shadow-lg min-w-[200px] max-w-[400px] max-h-[50vh] overflow-y-auto z-40"
                              onMouseEnter={() => {
                                // Keep subdirectories visible when hovering over them
                                // Clear any pending timeout that would hide the dropdown
                                if (hoverTimeoutRef.current) {
                                  clearTimeout(hoverTimeoutRef.current);
                                  hoverTimeoutRef.current = null;
                                }
                              }}
                              onMouseLeave={() => {
                                // When leaving subdirectory dropdown, clear hover state
                                setHoveredSuggestionPath(null);
                                setHoveredSubdirectories([]);
                              }}
                            >
                              {hoveredSubdirectories.map((subdir) => (
                                <button
                                  key={subdir.path}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCustomPath(subdir.path);
                                    handleSuggestionSelect(subdir, true);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-left",
                                    "hover:bg-muted transition-colors",
                                    "text-xs font-mono"
                                  )}
                                >
                                  <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  <span className="whitespace-nowrap">{subdir.path}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {userHomeDirectory && (
                <div className="text-xs text-muted-foreground">
                  Your home: <span className="font-mono">{userHomeDirectory}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => handleSave()}
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
                setShowSettingsDropdown(false);
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
