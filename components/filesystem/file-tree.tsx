"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";

interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  mtime?: string;
}

interface FileTreeNodeProps {
  entry: FileEntry;
  level: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect?: (path: string) => void;
  selectedPath?: string;
}

function FileTreeNode({
  entry,
  level,
  expandedPaths,
  onToggle,
  onSelect,
  selectedPath,
}: FileTreeNodeProps) {
  const isExpanded = expandedPaths.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const isDirectory = entry.kind === "directory";
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDirectory && isExpanded && children.length === 0 && !loading) {
      loadChildren();
    }
  }, [isDirectory, isExpanded]);

  const loadChildren = async () => {
    if (!isDirectory) return;

    setLoading(true);
    try {
      const response = await fetch("/api/filesystem/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path, depth: 0 }),
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure entries is an array
        const entriesArray = Array.isArray(data.entries) ? data.entries : [];
        setChildren(entriesArray);
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (isDirectory) {
      onToggle(entry.path);
    } else {
      // Only call onSelect for files, not directories
      onSelect?.(entry.path);
    }
  };

  const paddingLeft = level * 16 + 8;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-sidebar-accent rounded",
          isSelected && "bg-sidebar-accent"
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-gray-400" />
            ) : (
              <Folder className="h-4 w-4 text-gray-400" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" /> {/* Spacer for alignment */}
            <File className="h-4 w-4 text-gray-400" />
          </>
        )}
        <span className="truncate text-sidebar-foreground">{entry.name}</span>
      </div>

      {isDirectory && isExpanded && (
        <div>
          {loading ? (
            <div className="px-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: paddingLeft + 16 }}>
              Loading...
            </div>
          ) : (
            children.map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                level={level + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  rootPath?: string;
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
}

export function FileTree({ rootPath = ".", onFileSelect, selectedPath }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { user, isLoaded } = useUser();

  // Clear file tree when user signs out
  useEffect(() => {
    if (isLoaded && !user) {
      setRootEntries([]);
      setExpandedPaths(new Set());
      setLoading(false);
    }
  }, [user, isLoaded]);

  const loadRoot = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/filesystem/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rootPath, depth: 0 }),
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure entries is an array before sorting
        const entriesArray = Array.isArray(data.entries) ? data.entries : [];
        const entries = entriesArray.sort((a: FileEntry, b: FileEntry) => {
          // Directories first, then files, both alphabetically
          if (a.kind !== b.kind) {
            return a.kind === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        setRootEntries(entries);
      }
    } catch (error) {
      console.error("Failed to load root directory:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load files if user is authenticated
    if (isLoaded && user) {
      loadRoot();
    } else if (isLoaded && !user) {
      // User is signed out, clear state
      setRootEntries([]);
      setExpandedPaths(new Set());
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, user, isLoaded]);

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Show loading state while checking authentication
  if (!isLoaded || loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading...</div>
    );
  }

  // Show message if user is not authenticated
  if (!user) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Please sign in to view files</div>
    );
  }

  return (
    <div className="flex flex-col">
      {rootEntries.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No files found</div>
      ) : (
        rootEntries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            level={0}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            onSelect={onFileSelect}
            selectedPath={selectedPath}
          />
        ))
      )}
    </div>
  );
}

