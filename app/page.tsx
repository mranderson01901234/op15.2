"use client";

import React, { useState, useRef, useEffect, Fragment } from "react";
import { flushSync } from "react-dom";
import { ArrowUp, X, Copy, ThumbsUp, ThumbsDown, Volume2, Pause, Play, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PDFUploadIcon } from "@/components/chat/pdf-upload-icon";
import type { PDFContent } from "@/lib/pdf/types";
import { SplitView } from "@/components/layout/split-view";
import { CodeMirrorEditor } from "@/components/editor/codemirror-editor";
import { ImageViewer } from "@/components/image/image-viewer";
import { VideoViewer } from "@/components/video/video-viewer";
import BrowserPanel from "@/components/browser/BrowserPanel";
import { BrowserViewer } from "@/components/browser/browser-viewer";
import { useWorkspace } from "@/contexts/workspace-context";
import { useChat, type Message as ChatMessage } from "@/contexts/chat-context";
import { useChatInput } from "@/contexts/chat-input-context";
import { LocalEnvConnector } from "@/components/local-env/local-env-connector";
import { CommandsButton } from "@/components/layout/commands-button";
import { SignedIn, useAuth } from "@clerk/nextjs";
import { UserButtonWithClear } from "@/components/auth/user-button-with-clear";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Thumbnail {
  src: string;
  original: string | null;
}

interface Image {
  thumbnail: Thumbnail | null;
  url: string;
  title: string;
}

interface Video {
  thumbnail: Thumbnail | null;
  url: string;
  title: string;
  duration: string | null;
  age: string | null;
}

interface Discussion {
  title: string;
  url: string;
  description: string;
  age: string | null;
}

interface Source {
  title: string;
  url: string;
  description?: string;
  type: string;
}

interface FormattedSearchData {
  query: string;
  images: Image[];
  videos: Video[];
  discussions: Discussion[];
  allSources: Source[];
}

// Message interface is now imported from chat-context, but keeping local types for compatibility
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResponses?: Array<{ name: string; response: unknown; status?: 'success' | 'error' }>;
  contentParts?: Array<
    | { type: 'text'; content: string }
    | { type: 'tool'; name: string; args: Record<string, unknown>; response?: unknown; status?: 'success' | 'error' }
  >;
  images?: Image[];
  videos?: Video[];
  formattedSearch?: FormattedSearchData;
  userQuery?: string; // Store the original user query for summary
  timestamp?: number;
}

// Format timestamp for display
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Get animation class for assistant messages based on content length
function getAssistantAnimationClass(messageId: string, contentLength: number): string {
  // Short messages (< 200 chars) fade in fully at once
  if (contentLength < 200) {
    return "assistant-content-fade-full";
  }
  
  // For longer messages, rotate between top-to-bottom and left-to-right
  // Use message ID hash to ensure consistent animation per message
  const hash = messageId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const animationIndex = hash % 2;
  
  return animationIndex === 0 
    ? "assistant-content-fade-top-bottom" 
    : "assistant-content-fade-left-right";
}

// Render text with word highlighting for speech
function renderTextWithHighlighting(
  content: string, 
  words: string[], 
  highlightedIndex: number | null
): React.ReactElement {
  if (highlightedIndex === null || words.length === 0) {
    return <>{content}</>;
  }

  // Create a regex to find and highlight the current word
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  const text = content;
  
  // Find all occurrences of words and highlight the one at highlightedIndex
  const wordsWithPositions: Array<{ word: string; index: number; start: number; end: number }> = [];
  let searchIndex = 0;
  
  words.forEach((word, idx) => {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const match = text.substring(searchIndex).match(regex);
    if (match) {
      const start = text.indexOf(match[0], searchIndex);
      const end = start + match[0].length;
      wordsWithPositions.push({ word: match[0], index: idx, start, end });
      searchIndex = end;
    }
  });

  // Build the highlighted text
  let currentPos = 0;
  wordsWithPositions.forEach(({ word, index, start, end }) => {
    if (currentPos < start) {
      parts.push(text.substring(currentPos, start));
    }
    if (index === highlightedIndex) {
      parts.push(
        <mark key={`highlight-${index}`} className="bg-primary/30 text-foreground px-0.5 rounded">
          {word}
        </mark>
      );
    } else {
      parts.push(word);
    }
    currentPos = end;
  });

  if (currentPos < text.length) {
    parts.push(text.substring(currentPos));
  }

  return <>{parts}</>;
}

// Prevent orphaned words by keeping last two words together
function preventOrphanedWords(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= 2) return text;
  // Replace last space with non-breaking space to keep last two words together
  const lastTwoWords = words.slice(-2).join('\u00A0'); // \u00A0 is non-breaking space
  return words.slice(0, -2).join(' ') + ' ' + lastTwoWords;
}

// Expandable folder row component
function ExpandableFolderRow({
  row,
  headers,
  rowIdx,
  keyId,
  isExpanded,
  onToggle,
  onFileClick,
  children
}: {
  row: string[];
  headers: string[];
  rowIdx: number;
  keyId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onFileClick?: (path: string) => void;
  children?: React.ReactNode;
}) {
  const firstCell = row[0] || '';
  const isFolder = firstCell.includes('📁');
  
  // Check if it's a file (must have Type column explicitly saying "File", not "Directory")
  const typeColumnIndex = headers.findIndex(h => h.toLowerCase() === 'type');
  const typeValue = typeColumnIndex >= 0 ? row[typeColumnIndex]?.toLowerCase().trim() : '';
  const isFile = typeColumnIndex >= 0 
    ? typeValue === 'file' // Only treat as file if Type column explicitly says "File"
    : !isFolder && !firstCell.includes('📁'); // If no Type column, check if it's not a folder (no 📁 icon)
  
  // Extract path (usually in second column, index 1)
  const getPath = (): string | null => {
    const pathColumnIndex = headers.findIndex(h => h.toLowerCase() === 'path');
    const pathIndex = pathColumnIndex >= 0 ? pathColumnIndex : 1; // Default to index 1 if no Path column
    if (row.length > pathIndex && row[pathIndex]) {
      let path = row[pathIndex].trim();
      path = path.replace(/\*\*/g, '');
      path = path.replace(/`/g, '');
      path = path.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      return path;
    }
    return null;
  };

  const handleFileClick = () => {
    // Double-check: don't treat directories as files
    if (isFile && !isFolder && onFileClick) {
      const path = getPath();
      if (path) {
        onFileClick(path);
      }
    }
  };
  
  if (isFile) {
    return (
      <tr
        key={`row-${rowIdx}`}
        className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={handleFileClick}
      >
        {row.map((cell, cellIdx) => (
          <td
            key={`cell-${rowIdx}-${cellIdx}`}
            className="px-4 py-3 text-[15px] text-foreground/90"
          >
            {formatInlineContent(cell.trim())}
          </td>
        ))}
      </tr>
    );
  }
  
  if (!isFolder) {
    return (
      <tr
        key={`row-${rowIdx}`}
        className="border-b border-border/40 last:border-b-0"
      >
        {row.map((cell, cellIdx) => (
          <td
            key={`cell-${rowIdx}-${cellIdx}`}
            className="px-4 py-3 text-[15px] text-foreground/90"
          >
            {formatInlineContent(cell.trim())}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <>
      <tr
        key={`row-${rowIdx}`}
        className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {row.map((cell, cellIdx) => (
          <td
            key={`cell-${rowIdx}-${cellIdx}`}
            className="px-4 py-3 text-[15px] text-foreground/90"
          >
            <div className="flex items-center gap-2">
              {cellIdx === 0 && (
                <ChevronDown 
                  className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                />
              )}
              {formatInlineContent(cell.trim())}
            </div>
          </td>
        ))}
      </tr>
      {isExpanded && children && (
        <tr>
          <td colSpan={headers.length} className="px-4 py-3 bg-muted/20">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}

// Nested directory table component for recursive directory expansion
function NestedDirectoryTable({
  directories,
  parentKeyId,
  openFile,
  handleFileOpen
}: {
  directories: string[][];
  parentKeyId: string;
  openFile?: (path: string, content: string) => void;
  handleFileOpen?: (path: string) => void;
}) {
  const [expandedDirs, setExpandedDirs] = useState<Map<number, boolean>>(new Map());
  const [dirContents, setDirContents] = useState<Map<number, { directories: string[][]; files: string[][]; loading: boolean }>>(new Map());

  const getDirPath = (row: string[]): string | null => {
    if (row.length > 1 && row[1]) {
      let path = row[1].trim();
      path = path.replace(/\*\*/g, '');
      path = path.replace(/`/g, '');
      path = path.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      return path;
    }
    return null;
  };

  const handleDirToggle = async (dirIdx: number, row: string[]) => {
    const path = getDirPath(row);
    if (!path) return;

    const isCurrentlyExpanded = expandedDirs.get(dirIdx) || false;

    if (!isCurrentlyExpanded && !dirContents.has(dirIdx)) {
      setDirContents(prev => {
        const newMap = new Map(prev);
        newMap.set(dirIdx, { directories: [], files: [], loading: true });
        return newMap;
      });

      try {
        const response = await fetch("/api/filesystem/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, depth: 0 }),
        });

        if (response.ok) {
          const data = await response.json();
          const entries = Array.isArray(data.entries) ? data.entries : [];

          const sorted = entries.sort((a: any, b: any) => {
            if (a.kind === 'directory' && b.kind !== 'directory') return -1;
            if (a.kind !== 'directory' && b.kind === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });

          const nestedDirs: string[][] = [];
          const nestedFiles: string[][] = [];

          sorted.forEach((entry: any) => {
            const name = entry.name || '';
            const entryPath = entry.path || '';

            let mtime = '-';
            if (entry.mtime) {
              const d = new Date(entry.mtime);
              const now = new Date();
              const diffMs = now.getTime() - d.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);

              if (diffMins < 1) mtime = 'Just now';
              else if (diffMins < 60) mtime = `${diffMins}m ago`;
              else if (diffHours < 24) mtime = `${diffHours}h ago`;
              else if (diffDays < 7) mtime = `${diffDays}d ago`;
              else mtime = d.toLocaleDateString();
            }

            if (entry.kind === 'directory') {
              nestedDirs.push([`📁 **${name}**`, entryPath, mtime]);
            } else {
              const size = entry.size !== undefined ? formatFileSizeForNested(entry.size) : '-';
              const ext = name.split('.').pop() || '';
              const icon = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? '📄' :
                          ['json', 'yaml', 'yml'].includes(ext) ? '⚙️' :
                          ['md', 'txt'].includes(ext) ? '📝' :
                          ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext) ? '🖼️' : '📄';
              nestedFiles.push([`${icon} ${name}`, entryPath, size, mtime]);
            }
          });

          setDirContents(prev => {
            const newMap = new Map(prev);
            newMap.set(dirIdx, { directories: nestedDirs, files: nestedFiles, loading: false });
            return newMap;
          });
        }
      } catch (error) {
        console.error("Failed to load nested directory:", error);
        setDirContents(prev => {
          const newMap = new Map(prev);
          newMap.set(dirIdx, { directories: [], files: [], loading: false });
          return newMap;
        });
      }
    }

    setExpandedDirs(prev => {
      const newMap = new Map(prev);
      newMap.set(dirIdx, !isCurrentlyExpanded);
      return newMap;
    });
  };

  const formatFileSizeForNested = (bytes: number): string => {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div>
      <div className="text-sm font-semibold text-foreground mb-2">
        Directories ({directories.length})
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/30">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Path</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Modified</th>
          </tr>
        </thead>
        <tbody>
          {directories.map((dirRow, dirIdx) => {
            const isExpanded = expandedDirs.get(dirIdx) || false;
            const contents = dirContents.get(dirIdx);

            return (
              <Fragment key={`nested-dir-${dirIdx}`}>
                <tr
                  className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => handleDirToggle(dirIdx, dirRow)}
                >
                  {dirRow.map((cell, cellIdx) => (
                    <td key={`nested-dir-cell-${cellIdx}`} className="px-3 py-2 text-xs text-foreground/80">
                      <div className="flex items-center gap-2">
                        {cellIdx === 0 && (
                          <ChevronDown
                            className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                          />
                        )}
                        {formatInlineContent(cell.trim())}
                      </div>
                    </td>
                  ))}
                </tr>
                {isExpanded && contents && (
                  <tr>
                    <td colSpan={3} className="px-3 py-2 bg-muted/20">
                      {contents.loading ? (
                        <div className="py-2 text-xs text-muted-foreground text-center">
                          Loading...
                        </div>
                      ) : contents.directories.length > 0 || contents.files.length > 0 ? (
                        <div className="py-2 space-y-3 ml-4 border-l-2 border-border/20 pl-4">
                          {contents.directories.length > 0 && (
                            <NestedDirectoryTable
                              directories={contents.directories}
                              parentKeyId={`${parentKeyId}-nested-${dirIdx}`}
                              openFile={openFile}
                              handleFileOpen={handleFileOpen}
                            />
                          )}
                          {contents.files.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-foreground mb-1">
                                Files ({contents.files.length})
                              </div>
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-border/30">
                                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">Name</th>
                                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">Path</th>
                                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">Size</th>
                                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">Modified</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contents.files.map((fileRow, fileIdx) => (
                                    <ClickableFileRow
                                      key={`nested-file-${fileIdx}`}
                                      row={fileRow}
                                      headers={['Name', 'Path', 'Size', 'Modified']}
                                      rowIdx={fileIdx}
                                      keyId={`${parentKeyId}-nested-file-${fileIdx}`}
                                      onFileClick={handleFileOpen || (async (path: string) => {
                  if (!openFile) return;
                  try {
                    const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
                    if (response.ok) {
                      const data = await response.json();
                      openFile(path, data.content || '');
                    }
                  } catch (error) {
                    console.error('Error reading file:', error);
                  }
                })}
                                    />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-2 text-xs text-muted-foreground text-center">
                          Empty directory
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Clickable file row component for nested tables
function ClickableFileRow({
  row,
  headers,
  rowIdx,
  keyId,
  onFileClick
}: {
  row: string[];
  headers: string[];
  rowIdx: number;
  keyId: string;
  onFileClick: (path: string) => void;
}) {
  // Extract path from file row (usually in second column, index 1)
  const getFilePath = (): string | null => {
    if (row.length > 1 && row[1]) {
      let path = row[1].trim();
      // Strip any markdown formatting
      path = path.replace(/\*\*/g, '');
      path = path.replace(/`/g, '');
      path = path.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      return path;
    }
    return null;
  };

  const filePath = getFilePath();
  const isClickable = filePath !== null;

  const handleClick = () => {
    if (filePath && isClickable) {
      onFileClick(filePath);
    }
  };

  return (
    <tr
      key={`file-row-${rowIdx}`}
      className={`border-b border-border/20 ${isClickable ? 'hover:bg-muted/30 transition-colors cursor-pointer' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      {row.map((cell, cellIdx) => (
        <td key={`file-cell-${cellIdx}`} className="px-3 py-2 text-xs text-foreground/80">
          {formatInlineContent(cell.trim())}
        </td>
      ))}
    </tr>
  );
}

// Table component for markdown tables
function MarkdownTable({ 
  headers, 
  rows, 
  keyId,
  openFile,
  handleFileOpen
}: { 
  headers: string[]; 
  rows: string[][]; 
  keyId: string;
  openFile?: (path: string, content: string) => void;
  handleFileOpen?: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Map<number, boolean>>(new Map());
  const [folderContents, setFolderContents] = useState<Map<number, { directories: string[][]; files: string[][]; loading: boolean }>>(new Map());
  const MAX_INITIAL_ROWS = 5;
  const hasMoreRows = rows.length > MAX_INITIAL_ROWS;
  const visibleRows = isExpanded ? rows : rows.slice(0, MAX_INITIAL_ROWS);
  const remainingCount = rows.length - MAX_INITIAL_ROWS;

  // Check if a row is a folder by looking for 📁 emoji
  const isFolderRow = (row: string[]): boolean => {
    const firstCell = row[0] || '';
    return firstCell.includes('📁');
  };

  // Extract path from a folder row (usually in second column)
  const getFolderPath = (row: string[]): string | null => {
    if (!isFolderRow(row)) return null;
    // Path is typically in the second column (index 1)
    if (row.length > 1 && row[1]) {
      // Strip any markdown formatting (like **bold** or `code`) from the path
      let path = row[1].trim();
      path = path.replace(/\*\*/g, ''); // Remove bold markers
      path = path.replace(/`/g, ''); // Remove code markers
      path = path.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove markdown links, keep text
      return path;
    }
    return null;
  };

  const handleFolderToggle = async (rowIdx: number, row: string[]) => {
    const path = getFolderPath(row);
    if (!path) return;

    const isCurrentlyExpanded = expandedFolders.get(rowIdx) || false;
    
    if (!isCurrentlyExpanded && !folderContents.has(rowIdx)) {
      // Fetch directory contents
      setFolderContents(prev => {
        const newMap = new Map(prev);
        newMap.set(rowIdx, { directories: [], files: [], loading: true });
        return newMap;
      });

      try {
        const response = await fetch("/api/filesystem/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, depth: 0 }),
        });

        if (response.ok) {
          const data = await response.json();
          const entries = Array.isArray(data.entries) ? data.entries : [];
          
          // Sort: directories first, then files
          const sorted = entries.sort((a: any, b: any) => {
            if (a.kind === 'directory' && b.kind !== 'directory') return -1;
            if (a.kind !== 'directory' && b.kind === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });

          const directories: string[][] = [];
          const files: string[][] = [];

          sorted.forEach((entry: any) => {
            const name = entry.name || '';
            const entryPath = entry.path || '';
            
            // Format date using relative time format
            let mtime = '-';
            if (entry.mtime) {
              const d = new Date(entry.mtime);
              const now = new Date();
              const diffMs = now.getTime() - d.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);
              
              if (diffMins < 1) mtime = 'Just now';
              else if (diffMins < 60) mtime = `${diffMins}m ago`;
              else if (diffHours < 24) mtime = `${diffHours}h ago`;
              else if (diffDays < 7) mtime = `${diffDays}d ago`;
              else mtime = d.toLocaleDateString();
            }
            
            if (entry.kind === 'directory') {
              directories.push([`📁 **${name}**`, entryPath, mtime]);
            } else {
              const size = entry.size !== undefined ? formatFileSize(entry.size) : '-';
              const ext = name.split('.').pop() || '';
              const icon = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? '📄' :
                          ['json', 'yaml', 'yml'].includes(ext) ? '⚙️' :
                          ['md', 'txt'].includes(ext) ? '📝' :
                          ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext) ? '🖼️' : '📄';
              files.push([`${icon} ${name}`, entryPath, size, mtime]);
            }
          });

          setFolderContents(prev => {
            const newMap = new Map(prev);
            newMap.set(rowIdx, { directories, files, loading: false });
            return newMap;
          });
        }
      } catch (error) {
        console.error("Failed to load directory:", error);
        setFolderContents(prev => {
          const newMap = new Map(prev);
          newMap.set(rowIdx, { directories: [], files: [], loading: false });
          return newMap;
        });
      }
    }

    setExpandedFolders(prev => {
      const newMap = new Map(prev);
      newMap.set(rowIdx, !isCurrentlyExpanded);
      return newMap;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            {headers.map((header, idx) => (
              <th
                key={`header-${idx}`}
                className="px-4 py-3 text-left text-[15px] font-semibold text-foreground"
              >
                {formatInlineContent(header.trim())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIdx) => {
            const isFolder = isFolderRow(row);
            const isExpandedFolder = expandedFolders.get(rowIdx) || false;
            const contents = folderContents.get(rowIdx);
            
            return (
              <ExpandableFolderRow
                key={`row-${rowIdx}`}
                row={row}
                headers={headers}
                rowIdx={rowIdx}
                keyId={`${keyId}-row-${rowIdx}`}
                isExpanded={isExpandedFolder}
                onToggle={() => handleFolderToggle(rowIdx, row)}
                onFileClick={handleFileOpen || (async (path: string) => {
                  if (!openFile) return;
                  try {
                    const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
                    if (response.ok) {
                      const data = await response.json();
                      openFile(path, data.content || '');
                    }
                  } catch (error) {
                    console.error('Error reading file:', error);
                  }
                })}
              >
                {contents?.loading ? (
                  <div className="py-4 text-sm text-muted-foreground text-center">
                    Loading...
                  </div>
                ) : contents && (contents.directories.length > 0 || contents.files.length > 0) ? (
                  <div className="py-2 space-y-4">
                    {contents.directories.length > 0 && (
                      <NestedDirectoryTable
                        directories={contents.directories}
                        parentKeyId={`${keyId}-parent-${rowIdx}`}
                        openFile={openFile}
                        handleFileOpen={handleFileOpen}
                      />
                    )}
                    {contents.files.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-foreground mb-2">
                          Files ({contents.files.length})
                        </div>
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border/30">
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Path</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Size</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Modified</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contents.files.map((fileRow, fileIdx) => (
                              <ClickableFileRow
                                key={`file-${fileIdx}`}
                                row={fileRow}
                                headers={['Name', 'Path', 'Size', 'Modified']}
                                rowIdx={fileIdx}
                                keyId={`${keyId}-nested-file-${fileIdx}`}
                                onFileClick={handleFileOpen || (async (path: string) => {
                  if (!openFile) return;
                  try {
                    const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
                    if (response.ok) {
                      const data = await response.json();
                      openFile(path, data.content || '');
                    }
                  } catch (error) {
                    console.error('Error reading file:', error);
                  }
                })}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : contents && !contents.loading ? (
                  <div className="py-4 text-sm text-muted-foreground text-center">
                    Empty directory
                  </div>
                ) : null}
              </ExpandableFolderRow>
            );
          })}
        </tbody>
      </table>
      {hasMoreRows && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-primary hover:text-primary/80 underline-offset-2 hover:underline transition-colors flex items-center gap-1 mx-auto"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show {remainingCount} more {remainingCount === 1 ? 'item' : 'items'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// Collapsible bullet list component
function CollapsibleBulletList({ 
  bullets, 
  keyId 
}: { 
  bullets: string[]; 
  keyId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = bullets.length > 3;
  const visibleBullets = isLong && !isExpanded ? bullets.slice(0, 3) : bullets;
  const hiddenCount = bullets.length - 3;

  return (
    <div className="my-2">
      {visibleBullets.map((bulletText, idx) => (
        <div key={`bullet-${keyId}-${idx}`} className="flex items-start gap-2 mb-2.5 ml-2">
          <span className="text-primary mt-1.5">•</span>
          <span className="flex-1 leading-[1.8] text-[15px]">{formatInlineContent(bulletText)}</span>
        </div>
      ))}
      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 ml-2"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Show {hiddenCount} more</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Collapsible code block component for long outputs
function CollapsibleCodeBlock({ 
  content, 
  language, 
  keyId 
}: { 
  content: string; 
  language?: string; 
  keyId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lines = content.split('\n');
  const isLong = lines.length > 20 || content.length > 1000;
  const previewLines = 10;
  const previewContent = isLong && !isExpanded 
    ? lines.slice(0, previewLines).join('\n') + '\n...'
    : content;

  if (!isLong) {
    // Render normally if not long enough
    return (
      <div className="my-4 rounded-lg bg-muted/50 border border-border/30 overflow-hidden">
        {language && (
          <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border/30 bg-muted/30 font-mono">
            {language}
          </div>
        )}
        <pre className="p-4 overflow-x-auto text-sm font-mono">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg bg-muted/50 border border-border/30 overflow-hidden">
      {language && (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border/30 bg-muted/30 font-mono">
          {language}
        </div>
      )}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/30"
      >
        <span className="font-medium">
          {isExpanded ? 'Collapse' : 'Expand'} ({lines.length} lines)
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      <pre className="p-4 overflow-x-auto text-sm font-mono">
        <code>{previewContent}</code>
      </pre>
    </div>
  );
}

// Single tool execution display - clean and technical
function ToolExecutionStep({
  name,
  args,
  response,
  status,
  index
}: {
  name: string;
  args: Record<string, unknown>;
  response?: unknown;
  status?: 'success' | 'error';
  index: number;
}) {

  // Helper to format tool arguments cleanly
  const formatArgs = (args: Record<string, unknown>): string => {
    const relevantArgs: Record<string, unknown> = {};

    // Filter and format based on tool type
    Object.entries(args).forEach(([key, value]) => {
      // Skip internal flags and very long values
      if (key.startsWith('_') || (typeof value === 'string' && value.length > 200)) {
        return;
      }

      // For paths, show just the filename or last part
      if (key === 'path' && typeof value === 'string') {
        const parts = value.split('/');
        relevantArgs[key] = parts[parts.length - 1] || value;
      }
      // For query, truncate if too long
      else if (key === 'query' && typeof value === 'string') {
        relevantArgs[key] = value.length > 60 ? value.substring(0, 60) + '...' : value;
      }
      // For command, show as-is
      else if (key === 'command' && typeof value === 'string') {
        relevantArgs[key] = value;
      }
      // Skip displayResults and other boolean flags unless false
      else if (typeof value === 'boolean' && value === true) {
        return;
      }
      else {
        relevantArgs[key] = value;
      }
    });

    return Object.entries(relevantArgs)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
  };

  // Helper to extract meaningful output from response
  const formatResponse = (response: unknown, toolName: string): string | null => {
    if (!response || typeof response !== 'object') return null;

    const resp = response as Record<string, unknown>;

    // For exec.run, show stdout/stderr
    if (toolName === 'exec.run') {
      const stdout = resp.stdout as string;
      const stderr = resp.stderr as string;
      const exitCode = resp.exitCode as number;

      if (exitCode !== 0 && stderr) {
        return `Exit code: ${exitCode}\n${stderr}`;
      }
      if (stdout && stdout.trim()) {
        // Truncate if very long
        return stdout.length > 300 ? stdout.substring(0, 300) + '...' : stdout;
      }
    }

    // For fs.write, show success message
    if (toolName === 'fs.write' && resp.success) {
      return `File written: ${resp.path}`;
    }

    // For fs.list, show count
    if (toolName === 'fs.list' && resp.total) {
      return `${resp.total} items`;
    }

    // For brave.search, show result count
    if (toolName === 'brave.search' && resp.totalResults) {
      return `${resp.totalResults} results`;
    }

    // For errors
    if (resp.error) {
      return `Error: ${resp.error}`;
    }

    return null;
  };

  const output = response ? formatResponse(response, name) : null;
  const isError = status === 'error';
  const isComplete = !!response;

  return (
    <div className="my-3 text-sm">
      <div className="border border-border/40 rounded bg-muted/20 overflow-hidden">
        {/* Tool call header */}
        <div className="px-3 py-2 bg-muted/30 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-muted-foreground">[{index}]</span>
            <span className="font-medium text-foreground">{name}</span>
            {formatArgs(args) && (
              <span className="text-muted-foreground/80">{formatArgs(args)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isComplete ? (
              isError ? (
                <span className="text-xs text-red-400 font-mono">FAILED</span>
              ) : (
                <span className="text-xs text-green-400 font-mono">OK</span>
              )
            ) : (
              <span className="text-xs text-yellow-400 font-mono">RUNNING</span>
            )}
          </div>
        </div>

        {/* Tool output */}
        {output && (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground/90 whitespace-pre-wrap">
            {output}
          </div>
        )}
      </div>
    </div>
  );
}

// Format message content with code blocks, headers, and better structure
function formatMessageContent(content: string, openFile?: (path: string, content: string) => void, handleFileOpen?: (path: string) => void): React.ReactElement {
  const parts: React.ReactElement[] = [];
  let key = 0;

  // Split by code blocks first
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', content: match[2], language: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  // Process each segment
  segments.forEach((segment, segIdx) => {
    if (segment.type === 'code') {
      parts.push(
        <CollapsibleCodeBlock 
          key={`code-${key++}`}
          content={segment.content}
          language={segment.language}
          keyId={`code-${key-1}`}
        />
      );
    } else {
      // Process text content - normalize multiple consecutive newlines to max 2 (one paragraph break)
      // This prevents huge gaps from multiple consecutive empty lines
      const normalizedContent = segment.content.replace(/\n{3,}/g, '\n\n');
      
      // Parse tables first - extract tables and replace with placeholders
      // Markdown table format: | Header | Header |\n|-------|-------|\n| Cell | Cell |
      // More flexible regex to handle variations in spacing and formatting
      // Pattern 1: Standard markdown table with separator row
      const tableRegex1 = /(\|[^\n]+\|\s*\n\s*\|[\s\-:|]+\|\s*\n(?:\s*\|[^\n]+\|\s*\n?)+)/g;
      // Pattern 2: More permissive - allows for tables without strict separator format
      const tableRegex2 = /((?:\|[^\n]+\|\s*\n){2,})/g;
      
      const tables: Array<{ headers: string[]; rows: string[][]; placeholder: string; start: number; end: number }> = [];
      let tableIndex = 0;
      const tableMatches: Array<{ text: string; start: number; end: number }> = [];
      
      // Collect all table matches first using primary regex
      let tableMatch;
      while ((tableMatch = tableRegex1.exec(normalizedContent)) !== null) {
        tableMatches.push({
          text: tableMatch[1],
          start: tableMatch.index,
          end: tableMatch.index + tableMatch[1].length
        });
      }
      
      // Fallback: try alternative regex if no matches found
      if (tableMatches.length === 0) {
        tableRegex2.lastIndex = 0; // Reset regex
        while ((tableMatch = tableRegex2.exec(normalizedContent)) !== null) {
          const potentialTable = tableMatch[1];
          const lines = potentialTable.split('\n').filter(l => l.trim() && l.includes('|'));
          // Only consider it a table if it has at least 2 rows with pipes
          if (lines.length >= 2) {
            tableMatches.push({
              text: potentialTable,
              start: tableMatch.index,
              end: tableMatch.index + potentialTable.length
            });
          }
        }
      }
      
      // Process tables in reverse order to preserve indices when replacing
      for (let i = tableMatches.length - 1; i >= 0; i--) {
        const match = tableMatches[i];
        const tableText = match.text;
        const tableLines = tableText.split('\n').filter(l => l.trim() && l.includes('|'));
        
        if (tableLines.length >= 2) {
          // First line is headers
          const headerLine = tableLines[0];
          // Split by | and filter out empty strings (from leading/trailing |)
          const headerCells = headerLine.split('|').map(h => h.trim()).filter(h => h);
          
          // Check if second line is a separator (contains only dashes, pipes, colons, spaces)
          const secondLine = tableLines[1];
          const isSeparatorLine = /^[\s|\-:]+$/.test(secondLine.trim());
          
          // Skip separator line if present, otherwise treat all lines as data rows
          const startRowIndex = isSeparatorLine ? 2 : 1;
          const rows: string[][] = [];
          for (let j = startRowIndex; j < tableLines.length; j++) {
            const rowLine = tableLines[j];
            // Split by |, trim each cell, and filter out empty leading/trailing cells
            const splitCells = rowLine.split('|').map(c => c.trim());
            // Remove leading and trailing empty strings from split (caused by | at start/end)
            const rowCells = splitCells.filter((cell, idx) => {
              // Keep cells that are not empty, or if empty, only keep middle ones
              if (cell) return true;
              // For empty cells, skip first and last (they're from leading/trailing |)
              return idx > 0 && idx < splitCells.length - 1;
            });
            // Ensure row has same number of cells as headers
            if (rowCells.length === headerCells.length) {
              rows.push(rowCells);
            } else if (rowCells.length > 0) {
              // Pad or trim to match header count
              const adjustedRow = rowCells.slice(0, headerCells.length);
              while (adjustedRow.length < headerCells.length) {
                adjustedRow.push('');
              }
              rows.push(adjustedRow);
            }
          }
          
          if (headerCells.length > 0 && rows.length > 0) {
            const placeholder = `__TABLE_PLACEHOLDER_${tableIndex}__`;
            tables.push({ 
              headers: headerCells, 
              rows, 
              placeholder,
              start: match.start,
              end: match.end
            });
            tableIndex++;
          }
        }
      }
      
      // Replace tables with placeholders (in reverse order to preserve indices)
      let processedContent = normalizedContent;
      for (let i = tables.length - 1; i >= 0; i--) {
        const table = tables[i];
        const before = processedContent.substring(0, table.start);
        const after = processedContent.substring(table.end);
        processedContent = before + `\n${table.placeholder}\n` + after;
      }

      const lines = processedContent.split('\n');
      const textParts: React.ReactElement[] = [];
      let currentParagraph: string[] = [];
      let currentBulletGroup: string[] = [];
      let lastNumberedSectionIndex = -1;
      let contentAfterLastNumberedSection = '';

      // Helper function to flush bullet group
      const flushBulletGroup = () => {
        if (currentBulletGroup.length > 0) {
          textParts.push(
            <CollapsibleBulletList 
              key={`bullet-group-${key++}`}
              bullets={currentBulletGroup}
              keyId={`bullet-group-${key-1}`}
            />
          );
          // Track content after numbered sections
          if (lastNumberedSectionIndex >= 0) {
            contentAfterLastNumberedSection += currentBulletGroup.join(' ') + ' ';
          }
          currentBulletGroup = [];
        }
      };

      lines.forEach((line, idx) => {
        // Check if this line is a table placeholder
        const tablePlaceholderMatch = line.match(/^__TABLE_PLACEHOLDER_(\d+)__$/);
        if (tablePlaceholderMatch) {
          flushBulletGroup();
          // Flush any current paragraph before table
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          
          const tableIdx = parseInt(tablePlaceholderMatch[1]);
          const table = tables[tableIdx];
          if (table) {
            textParts.push(
              <MarkdownTable
                key={`table-${key++}`}
                headers={table.headers}
                rows={table.rows}
                keyId={`table-${key-1}`}
                openFile={openFile}
                handleFileOpen={handleFileOpen}
              />
            );
          }
          return;
        }
        
        // Check if next line is a table placeholder - if so, flush current paragraph now
        const nextLine = idx + 1 < lines.length ? lines[idx + 1] : null;
        const nextIsTable = nextLine && nextLine.match(/^__TABLE_PLACEHOLDER_(\d+)__$/);
        if (nextIsTable && currentParagraph.length > 0) {
          const paragraphText = currentParagraph.join(' ');
          textParts.push(
            <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
              {formatInlineContent(paragraphText)}
            </p>
          );
          if (lastNumberedSectionIndex >= 0) {
            contentAfterLastNumberedSection += paragraphText + ' ';
          }
          currentParagraph = [];
        }
        const trimmedLine = line.trim();

        // Headers (## or ###)
        if (trimmedLine.startsWith('###')) {
          flushBulletGroup();
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          textParts.push(
            <h3 key={`h3-${key++}`} className="text-lg font-semibold text-foreground mt-6 mb-3">
              {trimmedLine.replace(/^###\s*/, '')}
            </h3>
          );
          // Track content after numbered sections
          if (lastNumberedSectionIndex >= 0) {
            contentAfterLastNumberedSection += trimmedLine + ' ';
          }
        } else if (trimmedLine.startsWith('##')) {
          flushBulletGroup();
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          textParts.push(
            <Fragment key={`h2-section-${key++}`}>
              <h2 className="text-xl font-bold text-foreground mt-6 mb-3">
                {trimmedLine.replace(/^##\s*/, '')}
              </h2>
              <div className="h-px bg-gradient-to-r from-border/60 via-border/30 to-transparent mb-3"></div>
            </Fragment>
          );
          // Track content after numbered sections
          if (lastNumberedSectionIndex >= 0) {
            contentAfterLastNumberedSection += trimmedLine + ' ';
          }
        }
        // Introductory lines ending with colon (e.g., "This includes things like:")
        else if (trimmedLine.endsWith(':') && trimmedLine.length > 10 && trimmedLine.length < 100) {
          flushBulletGroup();
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          textParts.push(
            <p key={`intro-${key++}`} className="text-[15px] font-semibold text-foreground mt-4 mb-2 leading-[1.8]">
              {formatInlineContent(trimmedLine)}
            </p>
          );
          // Track content after numbered sections
          if (lastNumberedSectionIndex >= 0) {
            contentAfterLastNumberedSection += trimmedLine + ' ';
          }
        }
        // Numbered lists (1., 2., 3., etc. - handles both plain and bold formatted numbers)
        else if (/^\d+\.\s/.test(trimmedLine)) {
          flushBulletGroup();
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          
          // Check if we have substantial content after the last numbered section
          // If so, add extra spacing before this numbered section
          const hasLargeContentAfterPrevious = contentAfterLastNumberedSection.length > 200;
          const shouldAddExtraSpacing = lastNumberedSectionIndex >= 0 && hasLargeContentAfterPrevious;
          
          // Match numbered list items - extract number and content
          const numberMatch = trimmedLine.match(/^(\d+)\.\s*(.*)/);
          if (numberMatch) {
            const number = numberMatch[1];
            const content = numberMatch[2];
            textParts.push(
              <div key={`num-li-${key++}`} className={`flex items-start gap-3 ${shouldAddExtraSpacing ? 'mt-8' : ''} mb-3 ml-1`}>
                <span className="text-primary font-medium mt-0.5 min-w-[1.5rem]">{number}.</span>
                <span className="flex-1 leading-[1.8] text-[15px]">{formatInlineContent(content.trim())}</span>
              </div>
            );
          }
          
          // Reset tracking for this new numbered section
          lastNumberedSectionIndex = idx;
          contentAfterLastNumberedSection = '';
        }
        // Bullet points
        else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          // Flush paragraph before starting bullets
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          // Add to bullet group instead of rendering immediately
          const bulletText = trimmedLine.replace(/^[-*]\s*/, '');
          currentBulletGroup.push(bulletText);
        }
        // Empty line - paragraph break
        else if (trimmedLine === '') {
          flushBulletGroup();
          if (currentParagraph.length > 0) {
            const paragraphText = currentParagraph.join(' ');
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(paragraphText)}
              </p>
            );
            // Track content after numbered sections
            if (lastNumberedSectionIndex >= 0) {
              contentAfterLastNumberedSection += paragraphText + ' ';
            }
            currentParagraph = [];
          }
          // Skip multiple consecutive empty lines (already normalized to max 2)
        }
        // Regular text
        else {
          flushBulletGroup();
          currentParagraph.push(line);
        }
      });

      // Flush any remaining bullet group at the end
      flushBulletGroup();

      // Add remaining paragraph
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ');
        // Track content after numbered sections
        if (lastNumberedSectionIndex >= 0) {
          contentAfterLastNumberedSection += paragraphText + ' ';
        }
        // Split very long paragraphs (over 500 chars) into smaller chunks for better readability
        if (paragraphText.length > 500) {
          const sentences = paragraphText.match(/[^.!?]+[.!?]+/g) || [paragraphText];
          let currentChunk: string[] = [];
          let currentLength = 0;
          
          sentences.forEach((sentence) => {
            if (currentLength + sentence.length > 500 && currentChunk.length > 0) {
              textParts.push(
                <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                  {formatInlineContent(currentChunk.join(' '))}
                </p>
              );
              currentChunk = [sentence];
              currentLength = sentence.length;
            } else {
              currentChunk.push(sentence);
              currentLength += sentence.length;
            }
          });
          
          if (currentChunk.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentChunk.join(' '))}
              </p>
            );
          }
        } else {
          textParts.push(
            <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
              {formatInlineContent(paragraphText)}
            </p>
          );
        }
      }

      parts.push(<div key={`seg-${segIdx}`}>{textParts}</div>);
    }
  });

  return <>{parts}</>;
}

// Format inline content (links, bold, italic)
function formatInlineContent(text: string): React.ReactElement {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  // Process bold (**text**)
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`bold-${key++}`} className="font-semibold">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    remaining = text.slice(lastIndex);
  } else {
    return <>{parts}</>;
  }

  // Process links in remaining text
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const linkParts: (string | React.ReactElement)[] = [];
  lastIndex = 0;

  while ((match = urlRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      linkParts.push(remaining.slice(lastIndex, match.index));
    }
    linkParts.push(
      <a
        key={`link-${key++}`}
        href={match[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline underline-offset-2"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    linkParts.push(remaining.slice(lastIndex));
  }

  return <>{[...parts, ...linkParts]}</>;
}

function ProcessingIndicator() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes dot-bounce {
            0%, 80%, 100% {
              opacity: 0.3;
              transform: translateY(0);
            }
            40% {
              opacity: 1;
              transform: translateY(-4px);
            }
          }
        `
      }} />
      <div className="text-gray-400 text-sm font-mono flex items-center gap-1">
        <span>processing</span>
        <span className="flex gap-1">
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0s' }}>.</span>
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>.</span>
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>.</span>
        </span>
      </div>
    </>
  );
}

function FormattedSearchResponse({ 
  searchData, 
  userQuery,
  content 
}: { 
  searchData: FormattedSearchData; 
  userQuery?: string;
  content: string;
}) {
  const [activeTab, setActiveTab] = useState<"watch" | "listen" | "read">("watch");
  const { openVideo } = useWorkspace();
  
  const handleVideoClick = (videoUrl: string, videoTitle: string) => {
    // Always open in the split view (will replace current video if one is playing)
    openVideo(videoUrl, videoTitle);
  };

  // Add custom scrollbar styles for video horizontal scroll
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .video-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: #4a4a4a #1a1a1a;
      }
      .video-scrollbar::-webkit-scrollbar {
        height: 8px;
      }
      .video-scrollbar::-webkit-scrollbar-track {
        background: #1a1a1a;
        border-radius: 4px;
      }
      .video-scrollbar::-webkit-scrollbar-thumb {
        background: #4a4a4a;
        border-radius: 4px;
        border: 1px solid #1a1a1a;
      }
      .video-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #5a5a5a;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Extract domain from URL for logo
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  };

  // Parse content to extract summary and body sections
  const lines = content.split('\n').filter(l => l.trim());
  const summaryLine = lines.find(l => l.length < 100 && !l.startsWith('-') && !l.startsWith('•'));
  const summary = summaryLine || userQuery || searchData.query;
  
  // Extract bullet points from content
  const bulletPoints = lines.filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'));

  // Extract LLM-generated descriptions for sources
  // The LLM often mentions URLs and provides context - we'll extract that
  const extractLLMDescriptions = (content: string, sources: Source[]): Map<string, string> => {
    const descriptions = new Map<string, string>();
    
    // Find URL patterns in content
    const urlPattern = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlPattern) || [];
    
    // For each URL found, try to extract the description that follows
    urls.forEach((url, idx) => {
      try {
        const urlObj = new URL(url);
        const normalizedUrl = urlObj.hostname.replace('www.', '') + urlObj.pathname;
        
        // Find the source that matches this URL
        const matchingSource = sources.find(s => {
          try {
            const sUrl = new URL(s.url);
            const sNormalized = sUrl.hostname.replace('www.', '') + sUrl.pathname;
            return sNormalized === normalizedUrl || s.url === url;
          } catch {
            return s.url === url;
          }
        });
        
        if (matchingSource) {
          // Extract text after the URL (up to next URL or end of sentence/paragraph)
          const urlIndex = content.indexOf(url);
          if (urlIndex !== -1) {
            const afterUrl = content.slice(urlIndex + url.length);
            // Extract description: text after URL until next URL, newline, or end
            const nextUrlMatch = afterUrl.match(/https?:\/\/[^\s\)]+/);
            const endIndex = nextUrlMatch 
              ? afterUrl.indexOf(nextUrlMatch[0])
              : Math.min(afterUrl.indexOf('\n\n'), afterUrl.indexOf('. ', 50));
            
            let description = endIndex > 0 
              ? afterUrl.slice(0, endIndex).trim()
              : afterUrl.slice(0, 200).trim();
            
            // Clean up description
            description = description
              .replace(/^[:\-–—]\s*/, '') // Remove leading punctuation
              .replace(/\s+/g, ' ') // Normalize whitespace
              .slice(0, 200); // Limit length
            
            // Only use if it's substantial and relevant
            if (description.length > 20 && 
                !description.toLowerCase().includes('click here') &&
                !description.toLowerCase().includes('read more')) {
              descriptions.set(matchingSource.url, description);
            }
          }
        }
      } catch {
        // Skip invalid URLs
      }
    });
    
    return descriptions;
  };

  // Get LLM-generated descriptions
  const llmDescriptions = extractLLMDescriptions(content, searchData.allSources);

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <div>
        <h2 className="text-2xl font-bold mb-3">{summary}</h2>
        <div className="h-px bg-border/50 w-full"></div>
      </div>

      {/* Watch/Listen/Read Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveTab("watch")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "watch"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Watch {searchData.videos.length > 0 && `(${searchData.videos.length})`}
        </button>
        <button
          onClick={() => setActiveTab("listen")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "listen"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Listen {searchData.discussions.length > 0 && `(${searchData.discussions.length})`}
        </button>
        <button
          onClick={() => setActiveTab("read")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "read"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Read {searchData.allSources.filter(s => s.type === 'book').length > 0 && `(${searchData.allSources.filter(s => s.type === 'book').length})`}
        </button>
      </div>

      <div className="h-px bg-border/50 w-full"></div>

      {/* Tab Content */}
      {activeTab === "watch" && searchData.videos.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto video-scrollbar" style={{ scrollbarWidth: 'thin' }}>
            <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
              {searchData.videos.map((video, idx) => (
                video.thumbnail?.src ? (
                  <button
                    key={idx}
                    onClick={() => handleVideoClick(video.url, video.title)}
                    className="block hover:opacity-80 transition-opacity group relative flex-shrink-0 text-left"
                  >
                    <div className="relative">
                      <img
                        src={video.thumbnail.src}
                        alt={video.title}
                        className="h-32 w-48 object-cover rounded border border-border/50 cursor-pointer"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded">
                        <svg className="w-8 h-8 text-white opacity-90" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      {video.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {video.duration}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2 w-48">
                      {video.title}
                    </div>
                  </button>
                ) : null
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "listen" && searchData.discussions.length > 0 && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {searchData.discussions.map((discussion, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <a
                  href={discussion.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex-1"
                >
                  {discussion.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === "read" && (
        <div className="space-y-3">
          {bulletPoints.length > 0 || searchData.allSources.filter(s => s.type === 'book').length > 0 ? (
            <ul className="space-y-2">
              {bulletPoints.length > 0 ? (
                bulletPoints.map((point, idx) => {
                  // Try to extract URL from bullet point
                  const urlMatch = point.match(/https?:\/\/[^\s\)]+/);
                  const url = urlMatch ? urlMatch[0] : null;
                  const text = point.replace(/https?:\/\/[^\s\)]+/g, '').replace(/^[-•]\s*/, '').trim();
                  
                  return (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <div className="flex-1">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {getDomain(url) && (
                              <img src={getDomain(url)!} alt="" className="w-4 h-4" />
                            )}
                            {text || url}
                          </a>
                        ) : (
                          <span>{text}</span>
                        )}
                      </div>
                    </li>
                  );
                })
              ) : (
                searchData.allSources.filter(s => s.type === 'book').slice(0, 10).map((source, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {getDomain(source.url) && (
                        <img src={getDomain(source.url)!} alt="" className="w-4 h-4" />
                      )}
                      {source.title}
                    </a>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing this time!</p>
          )}
        </div>
      )}

      <div className="h-px bg-border/50 w-full"></div>

      {/* Top Sources Section */}
      {searchData.allSources.filter(s => s.type !== 'book').length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Sources</h3>
          
          {/* Top 6 Sources with Descriptions */}
          <div className="space-y-3">
            {searchData.allSources.filter(s => s.type !== 'book').slice(0, 6).map((source, idx) => {
              // Prefer LLM-generated description, fall back to filtered Brave description
              const llmDescription = llmDescriptions.get(source.url);
              const braveDescription = source.description && 
                source.description.length > 30 &&
                !source.description.toLowerCase().includes('click here') &&
                !source.description.toLowerCase().includes('read more') &&
                source.description !== source.title;
              
              const displayDescription = llmDescription || (braveDescription ? source.description : null);
              
              return (
                <div key={idx} className="space-y-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-2 font-medium"
                  >
                    {getDomain(source.url) && (
                      <img src={getDomain(source.url)!} alt="" className="w-4 h-4" />
                    )}
                    {source.title}
                  </a>
                  {displayDescription && (
                    <p className="text-sm text-muted-foreground pl-6 line-clamp-2">
                      {displayDescription}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* See More Dropdown for remaining sources */}
          {searchData.allSources.filter(s => s.type !== 'book').length > 6 && (
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none">
                <span className="flex items-center gap-2">
                  <span>See More ({searchData.allSources.filter(s => s.type !== 'book').length - 6} more sources)</span>
                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                {searchData.allSources.filter(s => s.type !== 'book').slice(6).map((source, idx) => (
                  <a
                    key={idx + 6}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    {getDomain(source.url) && (
                      <img src={getDomain(source.url)!} alt="" className="w-3 h-3" />
                    )}
                    <span className="truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="h-px bg-border/50 w-full"></div>

      {/* Closing Summary and CTA */}
      {content && (
        <div className="text-sm text-muted-foreground">
          {content.split('\n').filter(l => l.trim() && !l.startsWith('-') && !l.startsWith('•')).slice(-2).join('\n')}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [attachedPDFs, setAttachedPDFs] = useState<PDFContent[]>([]);
  const [uploadingPDFs, setUploadingPDFs] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [speakingWords, setSpeakingWords] = useState<string[]>([]);
  const [fileError, setFileError] = useState<{ path: string; reason: string; message: string } | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const prevIsLoadingRef = useRef(false);
  const prevIsProcessingRef = useRef(false);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const { openFile, updateEditorContent, editorState, imageState, openImage, closeImage, videoState, openVideo, closeVideo, browserState, openBrowser, closeBrowser } = useWorkspace();
  const { activeChatId, getActiveChat, createChat, updateChatMessages } = useChat();
  const { setInsertTextHandler, setSendMessageHandler, sendMessage } = useChatInput();
  const { userId, isLoaded: authLoaded } = useAuth();

  // Helper function to determine error reason from error message
  const getFileErrorReason = (errorMessage: string, filePath: string): { reason: string; message: string } => {
    const lowerError = errorMessage.toLowerCase();
    const lowerPath = filePath.toLowerCase();

    // Check for permission errors
    if (lowerError.includes('permission denied') || lowerError.includes('eacces') || lowerError.includes('eperm')) {
      return {
        reason: 'Permission Denied',
        message: `You don't have permission to read this file. The file may require elevated privileges or be owned by another user.`
      };
    }

    // Check for directory errors
    if (lowerError.includes('directory') || lowerError.includes('eisdir')) {
      return {
        reason: 'Directory Selected',
        message: `This is a directory, not a file. Directories cannot be opened in the editor.`
      };
    }

    // Check for binary files (common binary file extensions)
    const binaryExtensions = ['.bin', '.exe', '.so', '.dll', '.dylib', '.o', '.a', '.lib', '.img', '.iso', '.vmlinuz', '.initrd'];
    const isBinaryExtension = binaryExtensions.some(ext => lowerPath.endsWith(ext));
    
    // Check for common binary file paths
    const binaryPaths = ['/boot/vmlinuz', '/boot/initrd', '/usr/bin/', '/usr/sbin/', '/bin/', '/sbin/'];
    const isBinaryPath = binaryPaths.some(path => lowerPath.includes(path)) && !lowerPath.endsWith('.txt') && !lowerPath.endsWith('.md');

    // Check for invalid UTF-8 (common error when reading binary files as text)
    if (lowerError.includes('invalid') && (lowerError.includes('utf') || lowerError.includes('encoding'))) {
      return {
        reason: 'Binary File',
        message: `This file appears to be a binary file (executable, image, or other non-text format). Binary files cannot be displayed as text in the editor.`
      };
    }

    if (isBinaryExtension || isBinaryPath) {
      return {
        reason: 'Binary File',
        message: `This file appears to be a binary file (executable, image, or other non-text format). Binary files cannot be displayed as text in the editor.`
      };
    }

    // Check for file not found
    if (lowerError.includes('not found') || lowerError.includes('enoent')) {
      return {
        reason: 'File Not Found',
        message: `The file could not be found at this path. It may have been moved or deleted.`
      };
    }

    // Check for file too large (if we detect this error)
    if (lowerError.includes('too large') || lowerError.includes('size')) {
      return {
        reason: 'File Too Large',
        message: `This file is too large to open in the editor. Try opening it with a different tool.`
      };
    }

    // Generic error
    return {
      reason: 'Unable to Open File',
      message: `Unable to open this file: ${errorMessage}`
    };
  };

  // Helper function to handle file opening with error modal
  const handleFileOpen = async (path: string) => {
    if (!openFile) return;
    
    try {
      const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.error) {
          const errorInfo = getFileErrorReason(data.error, path);
          setFileError({ path, ...errorInfo });
          return;
        }
        openFile(path, data.content || '');
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        const errorInfo = getFileErrorReason(errorData.error || `HTTP ${response.status}`, path);
        setFileError({ path, ...errorInfo });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorInfo = getFileErrorReason(errorMessage, path);
      setFileError({ path, ...errorInfo });
    }
  };

  // Ensure component is mounted (client-side only) to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
    // Initialize speech synthesis (browser native, no external calls)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis;
      
      // Load voices and select a soothing male English voice
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // List of known female voice names to exclude
        const femaleVoiceNames = [
          'zira', 'susan', 'samantha', 'karen', 'fiona', 'victoria', 
          'alice', 'sarah', 'emma', 'kate', 'linda', 'lisa', 'mary',
          'nancy', 'shelley', 'tessa', 'veena', 'yuna', 'monica',
          'female', 'woman', 'girl'
        ];
        
        // List of known male voice names/keywords to prefer
        const maleVoiceNames = [
          'david', 'daniel', 'thomas', 'james', 'mark', 'richard',
          'male', 'man', 'guy', 'alex', 'fred', 'ralph', 'lee',
          'michael', 'paul', 'simon', 'tom', 'harry'
        ];
        
        // Score voices - higher score = more likely to be male
        const scoreVoice = (voice: SpeechSynthesisVoice): number => {
          const name = voice.name.toLowerCase();
          const lang = voice.lang.toLowerCase();
          let score = 0;
          
          // Exclude if it's clearly female
          if (femaleVoiceNames.some(female => name.includes(female))) {
            return -100;
          }
          
          // Bonus for male keywords
          if (maleVoiceNames.some(male => name.includes(male))) {
            score += 50;
          }
          
          // Prefer UK English (mild accent)
          if (lang.includes('en-gb') || lang.includes('en-uk')) {
            score += 20;
          } else if (lang.includes('en-us')) {
            score += 10;
          }
          
          // Prefer deeper-sounding names (avoid high-pitched sounding names)
          if (name.includes('deep') || name.includes('low') || name.includes('bass')) {
            score += 30;
          }
          
          return score;
        };
        
        // Filter and score all English voices
        const englishVoices = voices
          .filter(voice => {
            const lang = voice.lang.toLowerCase();
            return lang.startsWith('en');
          })
          .map(voice => ({
            voice,
            score: scoreVoice(voice)
          }))
          .filter(v => v.score >= 0) // Only keep non-female voices
          .sort((a, b) => b.score - a.score); // Sort by score descending
        
        // Select the highest scoring voice
        if (englishVoices.length > 0) {
          selectedVoiceRef.current = englishVoices[0].voice;
          console.log('Selected voice:', englishVoices[0].voice.name, 'Score:', englishVoices[0].score);
        }
      };
      
      // Voices may load asynchronously
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }
    };
  }, []);

  // Highlight words as they're spoken
  useEffect(() => {
    if (speakingMessageId && highlightedWordIndex !== null && highlightedWordIndex >= 0 && speakingWords.length > 0) {
      // Find the message element
      const messageElement = document.querySelector(`[data-message-id="${speakingMessageId}"]`);
      if (messageElement && highlightedWordIndex < speakingWords.length) {
        // Remove ALL previous highlights first
        const existingHighlights = messageElement.querySelectorAll('.speech-highlight');
        existingHighlights.forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            const textNode = document.createTextNode(el.textContent || '');
            parent.replaceChild(textNode, el);
            parent.normalize();
          }
        });

        // Get the word to highlight
        const wordToHighlight = speakingWords[highlightedWordIndex];
        if (!wordToHighlight) return;

        // Create regex to find the word (escape special regex characters)
        const escapedWord = wordToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        
        // Walk through all text nodes in the message element
        const walker = document.createTreeWalker(
          messageElement,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              // Skip if node is inside a mark element
              let parent = node.parentNode;
              while (parent && parent !== messageElement) {
                if (parent instanceof HTMLElement && parent.classList.contains('speech-highlight')) {
                  return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentNode;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let found = false;
        let node;
        let globalWordIndex = 0; // Track word position across all text nodes
        
        // First, collect all text nodes and their words
        const textNodes: Array<{ node: Text; words: Array<{ word: string; start: number; end: number }> }> = [];
        
        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          const words = text.split(/\s+/).filter(w => w.trim().length > 0);
          const wordPositions: Array<{ word: string; start: number; end: number }> = [];
          
          let currentPos = 0;
          words.forEach(word => {
            const start = text.indexOf(word, currentPos);
            if (start !== -1) {
              const end = start + word.length;
              wordPositions.push({ word, start, end });
              currentPos = end;
            }
          });
          
          if (wordPositions.length > 0) {
            textNodes.push({ node: node as Text, words: wordPositions });
          }
        }
        
        // Now find and highlight the word at highlightedWordIndex
        for (const { node: textNode, words } of textNodes) {
          for (const { word, start, end } of words) {
            if (globalWordIndex === highlightedWordIndex) {
              // Check if this word matches (case-insensitive)
              if (word.toLowerCase() === wordToHighlight.toLowerCase()) {
                try {
                  const range = document.createRange();
                  range.setStart(textNode, start);
                  range.setEnd(textNode, end);
                  
                  const mark = document.createElement('mark');
                  mark.className = 'speech-highlight bg-primary/30 text-foreground px-0.5 rounded transition-all duration-150';
                  mark.textContent = word;
                  
                  range.surroundContents(mark);
                  
                  // Scroll the highlighted word into view smoothly
                  mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                  
                  found = true;
                  break;
                } catch (e) {
                  console.warn('Could not highlight word:', e);
                }
              }
            }
            globalWordIndex++;
            if (found) break;
          }
          if (found) break;
        }
        
        // If we didn't find the word by occurrence, try simpler approach - just highlight first match
        if (!found) {
          const allText = messageElement.textContent || '';
          const simpleMatch = allText.match(regex);
          if (simpleMatch && simpleMatch.index !== undefined) {
            // Fallback: try to find and highlight using a simpler method
            const textNodes: Text[] = [];
            const simpleWalker = document.createTreeWalker(
              messageElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let n;
            while (n = simpleWalker.nextNode()) {
              textNodes.push(n as Text);
            }
            
            // Find the text node containing the word
            for (const textNode of textNodes) {
              const text = textNode.textContent || '';
              const idx = text.indexOf(wordToHighlight);
              if (idx !== -1) {
                try {
                  const range = document.createRange();
                  range.setStart(textNode, idx);
                  range.setEnd(textNode, idx + wordToHighlight.length);
                  
                  const mark = document.createElement('mark');
                  mark.className = 'speech-highlight bg-primary/30 text-foreground px-0.5 rounded transition-all duration-150';
                  mark.textContent = wordToHighlight;
                  
                  range.surroundContents(mark);
                  mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                  break;
                } catch (e) {
                  console.warn('Fallback highlight failed:', e);
                }
              }
            }
          }
        }
      }
    } else if (!speakingMessageId) {
      // Remove all highlights when not speaking
      document.querySelectorAll('.speech-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          const textNode = document.createTextNode(el.textContent || '');
          parent.replaceChild(textNode, el);
          parent.normalize();
        }
      });
    }
  }, [speakingMessageId, highlightedWordIndex, speakingWords]);

  // Lightweight text-to-speech using browser's native API (non-blocking)
  const speakMessage = async (messageId: string, text: string) => {
    // Check if browser supports speech synthesis
    if (!speechSynthesisRef.current || !('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Resume if paused
    if (isPaused && speakingMessageId === messageId) {
      speechSynthesisRef.current.resume();
      setIsPaused(false);
      return;
    }

    // Stop any currently playing speech
    if (speakingMessageId) {
      speechSynthesisRef.current.cancel();
    }

    // Clean text - remove markdown formatting, code blocks, etc.
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    if (!cleanText) return;

    // Split text into words for highlighting
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    setSpeakingWords(words);
    setHighlightedWordIndex(0);
    setSpeakingMessageId(messageId);
    setIsPaused(false);

    // Use browser's native SpeechSynthesis (non-blocking, async)
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Set voice to soothing male English voice
    if (selectedVoiceRef.current) {
      utterance.voice = selectedVoiceRef.current;
      utterance.lang = selectedVoiceRef.current.lang;
    } else {
      // Fallback to UK English if voice not loaded yet
      utterance.lang = 'en-GB';
    }
    
    // Adjust speech parameters for a deeper, more masculine, soothing tone
    utterance.rate = 0.92; // Slower pace for a more soothing, deliberate delivery
    utterance.pitch = 0.75; // Much lower pitch for a deeper, more masculine voice
    utterance.volume = 1.0;
    
    currentUtteranceRef.current = utterance;

    let currentWordIndex = 0;

    // Track word boundaries for highlighting
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // Find the word index based on character position
        const charIndex = event.charIndex;
        const textBefore = cleanText.substring(0, charIndex);
        // Split by whitespace and filter empty strings, trim each word
        const wordsBefore = textBefore.split(/\s+/).filter(w => w.trim().length > 0);
        const newIndex = wordsBefore.length;
        
        // Update highlighted word index (allow it to progress through all words)
        if (newIndex >= 0 && newIndex < words.length) {
          // Use requestAnimationFrame to ensure state updates properly
          requestAnimationFrame(() => {
            setHighlightedWordIndex(newIndex);
          });
        }
      }
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    };

    // This is non-blocking - browser handles it asynchronously
    speechSynthesisRef.current.speak(utterance);
  };

  const pauseSpeaking = () => {
    if (speechSynthesisRef.current && speakingMessageId) {
      speechSynthesisRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeSpeaking = () => {
    if (speechSynthesisRef.current && speakingMessageId && isPaused) {
      speechSynthesisRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopSpeaking = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    }
  };

  // Get messages from active chat
  const activeChat = getActiveChat();
  const messages: Message[] = activeChat?.messages || [];

  // Check if user is near the bottom of the chat (within 200px)
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 200;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll when user sends a message (only when not loading/processing)
  useEffect(() => {
    if (!isLoading && !isProcessing && messages.length > 0) {
      // Only scroll to bottom if we're not in the middle of streaming
      // Check if the last message is from user (meaning they just sent it)
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        scrollToBottom();
      }
    }
  }, [messages.length, isLoading, isProcessing]);

  // Track if we've already scrolled to user message to prevent repeated scrolling
  const hasScrolledToUserMessageRef = useRef(false);

  // Scroll last user message to top when LLM response starts
  useEffect(() => {
    const isLoadingStarted = (isLoading || isProcessing) && (!prevIsLoadingRef.current && !prevIsProcessingRef.current);
    
    // Reset scroll flag when loading stops
    if (!isLoading && !isProcessing) {
      hasScrolledToUserMessageRef.current = false;
    }
    
    // Scroll when loading starts (only once per loading session)
    if (isLoadingStarted && !hasScrolledToUserMessageRef.current && lastUserMessageRef.current && messagesContainerRef.current) {
      hasScrolledToUserMessageRef.current = true;
      
      // Use multiple requestAnimationFrames + delay to ensure DOM has fully updated
      // This ensures the assistant message placeholder has been added
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const messageElement = lastUserMessageRef.current;
            const container = messagesContainerRef.current;
            
            if (!messageElement || !container) return;
            
            // Use getBoundingClientRect for more reliable positioning
            const containerRect = container.getBoundingClientRect();
            const messageRect = messageElement.getBoundingClientRect();
            
            // Calculate how much we need to scroll DOWN (increase scrollTop) to move content UP
            // This positions the user message at the top of the visible area
            const containerPadding = 16; // p-4 = 16px
            const currentScrollTop = container.scrollTop;
            const messageOffsetFromContainerTop = messageRect.top - containerRect.top;
            const targetScrollTop = currentScrollTop + messageOffsetFromContainerTop - containerPadding;
            
            // Scroll DOWN (increase scrollTop) to move the user message UP to the top
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: "smooth"
            });
          }, 150); // Delay to ensure DOM is fully updated and assistant message is rendered
        });
      });
    }
    
    prevIsLoadingRef.current = isLoading;
    prevIsProcessingRef.current = isProcessing;
  }, [isLoading, isProcessing]);

  // Track when we should start auto-scrolling down (after initial scroll-to-top completes)
  const shouldAutoScrollDownRef = useRef(false);
  
  // Set flag to start auto-scrolling down after initial scroll-to-top delay
  useEffect(() => {
    if ((isLoading || isProcessing) && hasScrolledToUserMessageRef.current) {
      // Wait for initial scroll-to-top to complete (~500ms for smooth scroll)
      const timeoutId = setTimeout(() => {
        shouldAutoScrollDownRef.current = true;
      }, 550);
      
      return () => {
        clearTimeout(timeoutId);
        shouldAutoScrollDownRef.current = false;
      };
    } else {
      shouldAutoScrollDownRef.current = false;
    }
  }, [isLoading, isProcessing]);

  // Auto-scroll during streaming to follow the response as it grows
  // For longer responses: stop scrolling once user's last message reaches just before the header (around top:100)
  // The response will continue streaming below the input box without auto-scrolling
  useEffect(() => {
    if ((isLoading || isProcessing) && shouldAutoScrollDownRef.current && messagesContainerRef.current && messagesEndRef.current && lastUserMessageRef.current) {
      const container = messagesContainerRef.current;
      const messageElement = lastUserMessageRef.current;
      const endElement = messagesEndRef.current;
      
      if (!container || !messageElement || !endElement) return;
      
      // Check if this is a longer response by checking:
      // 1. Content length of the last assistant message (if exists)
      // 2. Scroll position - if we've scrolled significantly, it's likely a longer response
      const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
      const isLongResponse = lastAssistantMessage 
        ? (lastAssistantMessage.content?.length || 0) > 500 // Consider >500 chars as "long"
        : container.scrollHeight > container.clientHeight * 1.5; // Or if content is 1.5x viewport height
      
      // Check position of user's last message relative to container top
      const containerRect = container.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      const messageTopFromContainer = messageRect.top - containerRect.top;
      
      // Target position: stop scrolling sooner to keep user message further from header
      const targetTop = 150;
      const tolerance = 30; // Allow some tolerance
      
      // For longer responses: stop scrolling when user message is about to reach the header
      // This allows the response to continue streaming below the input box without auto-scrolling
      if (isLongResponse && messageTopFromContainer < targetTop + tolerance) {
        // User message is at or near the header position, stop scrolling
        // The response will continue streaming below the input box
        return;
      }
      
      // For shorter responses or when user message is below header position:
      // Continue auto-scrolling to follow the streaming response
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 50) {
        // Cancel any existing animation
        if (scrollAnimationFrameRef.current !== null) {
          cancelAnimationFrame(scrollAnimationFrameRef.current);
        }
        
        // Smooth scroll with consistent easing factor for gradual, continuous movement
        // The target recalculates each frame to follow content growth during streaming
        const easingFactor = 0.06; // Reduced from 0.08 for even smoother, more gradual movement
        const animate = () => {
          // Recalculate target each frame since content grows during streaming
          const currentScrollTop = container.scrollTop;
          const targetScrollTop = container.scrollHeight - container.clientHeight;
          const distance = targetScrollTop - currentScrollTop;
          
          // Stop if we're close enough (threshold reduced to 0.05px for ultra-smooth final positioning)
          if (Math.abs(distance) < 0.05) {
            container.scrollTop = targetScrollTop;
            scrollAnimationFrameRef.current = null;
            return;
          }
          
          // Apply easing: move a small fraction of the remaining distance each frame
          // This creates smooth, incremental movement that follows content growth seamlessly
          const scrollDelta = distance * easingFactor;
          container.scrollTop = currentScrollTop + scrollDelta;
          
          // Continue animation at 60fps via requestAnimationFrame
          scrollAnimationFrameRef.current = requestAnimationFrame(animate);
        };
        
        // Start animation
        scrollAnimationFrameRef.current = requestAnimationFrame(animate);
      }
    }
    
    // Cleanup: cancel animation when effect dependencies change or component unmounts
    return () => {
      if (scrollAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };
  }, [messages, isLoading, isProcessing]);

  // Ensure there's an active chat when component mounts
  useEffect(() => {
    if (!activeChatId) {
      createChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Clear input when switching chats
  useEffect(() => {
    setInput("");
  }, [activeChatId]);

  // Listen for workspace root changes and ensure LLM always has the latest workspace root
  // This ensures that when workspace root changes mid-conversation or when switching conversations,
  // the LLM is always aware of the current workspace root
  useEffect(() => {
    const handleWorkspaceRootChange = (event: CustomEvent) => {
      // Workspace root has changed - the next chat request will automatically fetch
      // the fresh workspace root from the API (which uses cache: 'no-store')
      // This ensures the LLM always has the latest workspace root
      console.log('Workspace root changed:', event.detail);
    };

    // Listen for workspace root changes
    window.addEventListener('workspaceRootChanged', handleWorkspaceRootChange as EventListener);

    return () => {
      window.removeEventListener('workspaceRootChanged', handleWorkspaceRootChange as EventListener);
    };
  }, []);

  // Ensure workspace root is always fresh when switching conversations
  // The chat API already fetches fresh workspace root on every request (cache: 'no-store'),
  // but this ensures we're aware of any changes when switching conversations
  useEffect(() => {
    // When switching conversations, the next message will automatically fetch
    // the latest workspace root from the API, ensuring the LLM always has the current workspace root
    // No action needed here - the chat API handles this automatically
  }, [activeChatId]);

  // Auto-resize textarea based on content
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      // Check if textarea has valid dimensions before resizing
      // This prevents incorrect sizing during layout transitions
      const rect = textarea.getBoundingClientRect();
      if (rect.width === 0) {
        // Textarea not yet laid out, retry after a short delay
        setTimeout(() => autoResizeTextarea(), 50);
        return;
      }
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // max-h-[200px]
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  // Auto-resize textarea when input changes
  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  // Delay auto-resize when image viewer opens/closes to prevent layout jumps
  useEffect(() => {
    // Delay resize until after split view transition completes (300ms)
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        autoResizeTextarea();
      });
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [imageState.isOpen]);

  // Auto-focus textarea on mount and after sending messages
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
      autoResizeTextarea();
    }
  }, [isLoading, messages.length]);

  // Register insert text handler
  useEffect(() => {
    setInsertTextHandler((text: string) => {
      setInput((prev) => {
        // If there's existing text, add a space before the new text
        return prev ? `${prev} ${text}` : text;
      });
      // Focus the textarea after inserting
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
          autoResizeTextarea();
        }
      }, 0);
    });
  }, [setInsertTextHandler]);

  // Use refs to avoid recreating handler on every render
  const isLoadingRef = useRef(isLoading);
  const activeChatIdRef = useRef(activeChatId);
  const messagesRef = useRef(messages);
  const attachedPDFsRef = useRef(attachedPDFs);
  
  // Keep refs up to date
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    attachedPDFsRef.current = attachedPDFs;
  }, [attachedPDFs]);

  // Register send message handler (only recreate when stable dependencies change)
  useEffect(() => {
    setSendMessageHandler(async (text: string) => {
      console.log("sendMessageHandler called", { text, isLoading: isLoadingRef.current });
      if (!text.trim() || isLoadingRef.current) {
        console.log("Blocked from sending:", { isEmpty: !text.trim(), isLoading: isLoadingRef.current });
        return;
      }

      // Ensure we have an active chat
      let currentChatId = activeChatIdRef.current;
      let currentMessages = messagesRef.current;
      
      if (!currentChatId) {
        currentChatId = createChat();
        currentMessages = [];
      }

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const userInput = text;
      const updatedMessages = [...currentMessages, userMessage];
      updateChatMessages(currentChatId, updatedMessages);
      
      // Store user query for potential search summary
      const assistantMessageId = `assistant-${Date.now()}`;
      console.log("Creating new assistant message", { assistantMessageId, text });
      const messagesWithAssistant = [
        ...updatedMessages,
        { id: assistantMessageId, role: "assistant" as const, content: "", userQuery: text, timestamp: Date.now() },
      ];
      updateChatMessages(currentChatId, messagesWithAssistant);
      setInput("");
      setAttachedPDFs([]);
      setIsLoading(true);
      setIsProcessing(true);

      try {
        // Prepare conversation history (include images from assistant messages)
        const conversationHistory = currentMessages
          .filter(msg => msg.role === "user" || msg.role === "assistant")
          .map(msg => {
            const historyMsg: any = {
              role: msg.role,
              content: msg.content,
            };
            // Include generated images from assistant messages
            if (msg.role === "assistant" && (msg as any).generatedImage) {
              historyMsg.images = [{
                dataUrl: (msg as any).generatedImage,
                mimeType: (msg as any).generatedImage.match(/^data:([^;]+);base64/)?.[1] || "image/jpeg",
              }];
            }
            return historyMsg;
          });
        
        // Check if user is asking about an image - if so, include the most recent generated image
        const imageKeywords = ["image", "picture", "photo", "it", "this image", "the image", "that image"];
        const userMessageLower = userInput.toLowerCase();
        const isAskingAboutImage = imageKeywords.some(keyword => userMessageLower.includes(keyword));
        
        // Find the most recent generated image in conversation history
        let imageToInclude: { dataUrl: string; mimeType: string } | null = null;
        if (isAskingAboutImage) {
          for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const msg = conversationHistory[i];
            if (msg.images && msg.images.length > 0) {
              imageToInclude = msg.images[0];
              break;
            }
          }
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userInput,
            pdfs: attachedPDFsRef.current.length > 0 ? attachedPDFsRef.current : undefined,
            history: conversationHistory,
            currentMessageImages: imageToInclude ? [imageToInclude] : undefined,
            editorState: {
              filePath: editorState.filePath,
              isOpen: editorState.isOpen,
            },
          }),
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Store the chat ID and message ID in variables that won't change
        const streamChatId = currentChatId;
        const streamAssistantMessageId = assistantMessageId;
        console.log("Starting stream", { streamChatId, streamAssistantMessageId, userInput });

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log("Stream done", { streamAssistantMessageId });
            break;
          }
          
          if (value) {
            const decoded = decoder.decode(value, { stream: true });
            buffer += decoded;
            console.log("Received stream chunk", { length: decoded.length, bufferLength: buffer.length });
          }
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              console.log("Processing SSE line", { data: data.substring(0, 100) });

              if (data === "[DONE]") {
                // Final update before clearing loading states
                if (streamChatId) {
                  flushSync(() => {
                    updateChatMessages(streamChatId, (prev: Message[]) => {
                      const updated = prev.map((msg: Message) => {
                        if (msg.id === streamAssistantMessageId) {
                          return { ...msg, content: msg.content || '', timestamp: Date.now() };
                        }
                        return msg;
                      });
                      return [...updated];
                    });
                  });
                }
                setIsLoading(false);
                setIsProcessing(false);
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "text") {
                  console.log("Received text chunk:", { 
                    length: parsed.content?.length, 
                    preview: parsed.content?.substring(0, 100),
                    streamAssistantMessageId
                  });
                  if (streamChatId) {
                    flushSync(() => {
                      updateChatMessages(streamChatId, (prev: Message[]) => {
                        const found = prev.find(m => m.id === streamAssistantMessageId);
                        console.log("Updating messages", { 
                          streamAssistantMessageId,
                          found: !!found,
                          totalMessages: prev.length,
                          lastMessageId: prev[prev.length - 1]?.id
                        });
                        return prev.map((msg: Message) => {
                          if (msg.id === streamAssistantMessageId) {
                            const newContent = (msg.content || '') + parsed.content;
                            const parts = [...(msg.contentParts || [])];

                            // If last part is text, create new part with appended content; otherwise create new text part
                            const lastPart = parts[parts.length - 1];
                            if (lastPart && lastPart.type === 'text') {
                              parts[parts.length - 1] = {
                                ...lastPart,
                                content: lastPart.content + parsed.content
                              };
                            } else {
                              parts.push({ type: 'text', content: parsed.content });
                            }

                            return { ...msg, content: newContent, contentParts: parts };
                          }
                          return msg;
                        });
                      });
                    });
                  }
                } else if (parsed.type === "function_call") {
                  console.log("Tool call:", parsed.functionCall);
                  // Store tool call in the message
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) => {
                        if (msg.id === streamAssistantMessageId) {
                          const newToolCall = {
                            name: parsed.functionCall.name,
                            args: parsed.functionCall.args,
                          };
                          const parts = [...(msg.contentParts || [])];

                          // Add tool call to contentParts
                          parts.push({
                            type: 'tool',
                            name: parsed.functionCall.name,
                            args: parsed.functionCall.args,
                          });

                          return {
                            ...msg,
                            toolCalls: [...(msg.toolCalls || []), newToolCall],
                            contentParts: parts,
                          };
                        }
                        return msg;
                      })
                    );
                  }
                } else if (parsed.type === "function_response") {
                  console.log("Tool response:", parsed.functionResponse);
                  // Store tool response in the message
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) => {
                        if (msg.id === streamAssistantMessageId) {
                          const newResponse = {
                            name: parsed.functionResponse.name,
                            response: parsed.functionResponse.response,
                            status: parsed.functionResponse.response && typeof parsed.functionResponse.response === 'object' && 'error' in parsed.functionResponse.response ? 'error' : 'success' as 'success' | 'error',
                          };
                          const parts = [...(msg.contentParts || [])];

                          // Find the most recent tool call with matching name and update it with response
                          for (let i = parts.length - 1; i >= 0; i--) {
                            const part = parts[i];
                            if (part.type === 'tool' && part.name === parsed.functionResponse.name && !part.response) {
                              parts[i] = {
                                ...part,
                                response: parsed.functionResponse.response,
                                status: newResponse.status
                              };
                              break;
                            }
                          }

                          return {
                            ...msg,
                            toolResponses: [...(msg.toolResponses || []), newResponse],
                            contentParts: parts,
                          };
                        }
                        return msg;
                      })
                    );
                  }
                } else if (parsed.type === "images") {
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === streamAssistantMessageId
                          ? { ...msg, images: parsed.images }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "videos") {
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === streamAssistantMessageId
                          ? { ...msg, videos: parsed.videos }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "formatted_search") {
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === streamAssistantMessageId
                          ? { ...msg, formattedSearch: parsed }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "editor_open") {
                  if (parsed.path && parsed.content !== undefined) {
                    openFile(parsed.path, parsed.content);
                  }
                } else if (parsed.type === "editor_update") {
                  if (parsed.path && parsed.content !== undefined && editorState.filePath) {
                    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase().trim();
                    const updatePath = normalizePath(parsed.path);
                    const editorPath = normalizePath(editorState.filePath);
                    
                    if (updatePath === editorPath || updatePath.endsWith(editorPath) || editorPath.endsWith(updatePath)) {
                      updateEditorContent(parsed.content);
                    }
                  }
                } else if (parsed.type === "image_generated") {
                  if (parsed.imageUrl) {
                    openImage(parsed.imageUrl);
                    // Store the generated image URL in the assistant message for conversation history
                    if (streamChatId) {
                      updateChatMessages(streamChatId, (prev: Message[]) =>
                        prev.map((msg: Message) =>
                          msg.id === streamAssistantMessageId
                            ? { ...msg, generatedImage: parsed.imageUrl } as any
                            : msg
                        )
                      );
                    }
                  }
                } else if (parsed.type === "error") {
                  if (streamChatId) {
                    updateChatMessages(streamChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === streamAssistantMessageId
                          ? { ...msg, content: msg.content + `\n\nError: ${parsed.error}` }
                          : msg
                      )
                    );
                  }
                  setIsLoading(false);
                  setIsProcessing(false);
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
          
          // Process any remaining buffer data when stream ends
          if (done) {
            // Process any remaining data in buffer
            if (buffer.trim()) {
              const remainingLines = buffer.split("\n");
              for (const line of remainingLines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);
                  if (data === "[DONE]") {
                    // Use setTimeout to ensure state updates happen after message updates
                    setTimeout(() => {
                      setIsLoading(false);
                      setIsProcessing(false);
                    }, 0);
                    return;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text" && streamChatId) {
                      updateChatMessages(streamChatId, (prev: Message[]) =>
                        prev.map((msg: Message) =>
                          msg.id === streamAssistantMessageId
                            ? { ...msg, content: msg.content + parsed.content }
                            : msg
                        )
                      );
                    }
                  } catch (e) {
                    console.error("Failed to parse final SSE data:", e);
                  }
                }
              }
            }
            // Force a final message update to ensure React re-renders
            // This ensures the UI updates even if the last chunk was already processed
            if (streamChatId) {
              // Get the latest messages to ensure we have the most up-to-date content
              const latestChat = getActiveChat();
              const latestMessages = latestChat?.messages || [];
              const latestMessage = latestMessages.find(m => m.id === streamAssistantMessageId);
              const finalContent = latestMessage?.content || '';
              
              // Force update with final content - create completely new object
              flushSync(() => {
                updateChatMessages(streamChatId, (prev: Message[]) => {
                  const updated = prev.map((msg: Message) => {
                    if (msg.id === streamAssistantMessageId) {
                      // Create completely new object with all properties
                      return { 
                        ...msg, 
                        content: finalContent,
                        timestamp: Date.now(),
                        // Force React to see this as a new object
                        _updated: Date.now()
                      } as Message & { _updated?: number };
                    }
                    return msg;
                  });
                  // Return completely new array
                  return [...updated];
                });
              });
              
              // Force another update cycle to ensure React processes it
              setTimeout(() => {
                flushSync(() => {
                  setIsLoading(false);
                  setIsProcessing(false);
                  setForceUpdate(prev => prev + 1); // Force re-render
                });
              }, 0);
            } else {
              // If no chat ID, just clear loading states
              setIsLoading(false);
              setIsProcessing(false);
            }
            break;
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        if (currentChatId) {
          updateChatMessages(currentChatId, (prev: Message[]) =>
            prev.map((msg: Message) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: msg.content + `\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
                  }
                : msg
            )
          );
        }
        setIsLoading(false);
        setIsProcessing(false);
      }
    });
  }, [setSendMessageHandler, createChat, updateChatMessages, editorState, openFile, updateEditorContent]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Don't allow sending messages if user is not authenticated
    if (!authLoaded || !userId) {
      return;
    }
    if ((!input.trim() && attachedPDFs.length === 0) || isLoading) return;
    
    // Use the shared sendMessageHandler to avoid duplicate stream processing
    // This ensures all messages go through the same handler, preventing duplicates
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
    <SplitView>
      <div 
        className="flex flex-col bg-background overflow-hidden relative"
        style={{
          height: '100%',
          minHeight: '100dvh', // Use dynamic viewport height for mobile Safari
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes fadeInAssistant {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeInContent {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeInTopToBottom {
              from {
                opacity: 0;
                clip-path: inset(0 0 100% 0);
              }
              to {
                opacity: 1;
                clip-path: inset(0 0 0 0);
              }
            }
            @keyframes fadeInLeftToRight {
              from {
                opacity: 0;
                clip-path: inset(0 100% 0 0);
              }
              to {
                opacity: 1;
                clip-path: inset(0 0 0 0);
              }
            }
            @keyframes fadeInFull {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            .assistant-content-fade-full {
              animation: fadeInFull 1.2s ease-in-out forwards;
            }
            .assistant-content-fade-top-bottom {
              animation: fadeInTopToBottom 1.8s ease-in-out forwards;
            }
            .assistant-content-fade-left-right {
              animation: fadeInLeftToRight 1.8s ease-in-out forwards;
            }
          `
        }} />
        {/* Local Environment Status - Top Left */}
        <div className="absolute top-4 left-4 z-10">
          <LocalEnvConnector />
        </div>
        {/* Messages Area - Scrollable */}
        <div 
          ref={messagesContainerRef} 
          className="flex-1 overflow-y-auto p-4 premium-scrollbar"
          style={{
            minHeight: 0, // Ensure flex child can shrink below content size
          }}
        >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-yellow-100 text-sm">Start a conversation...</p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl w-full pt-32 pb-24">
            {messages.map((message, index) => {
              // Only show assistant messages if they have content (avoid showing empty streaming placeholders)
              // Show if: user message, has content, has formatted search, has media, has tool calls, OR is currently loading
              const hasContent = message.content && message.content.trim().length > 0;
              const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
              const hasMedia = (message.images && message.images.length > 0) || (message.videos && message.videos.length > 0);
              const isCurrentlyStreaming = message.role === "assistant" && index === messages.length - 1 && (isLoading || isProcessing);
              // Check if this message was recently streaming (has timestamp and is the last assistant message)
              // This ensures messages don't disappear immediately after streaming ends
              const wasRecentlyStreaming = message.role === "assistant" && 
                                         index === messages.length - 1 && 
                                         message.timestamp && 
                                         (Date.now() - message.timestamp < 1000); // Within last second

              const shouldShow = message.role === "user" ||
                                 hasContent ||
                                 message.formattedSearch ||
                                 hasMedia ||
                                 hasToolCalls ||
                                 isCurrentlyStreaming ||
                                 wasRecentlyStreaming;

              if (!shouldShow) return null;

              // Use a key that includes content length for assistant messages to trigger re-mount on first content
              const messageKey = message.role === "assistant" && message.content
                ? `${message.id}-${message.content.length > 0 ? 'visible' : 'empty'}`
                : message.id;
              
              // Determine animation class based on content length
              // Short messages (< 200 chars) fade in fully, longer messages rotate between top-to-bottom and left-to-right
              const contentLength = message.content?.length || 0;
              const animationClass = message.role === "assistant" && message.content && !message.formattedSearch
                ? getAssistantAnimationClass(message.id, contentLength)
                : "";

              // Find the last user message to attach ref (check if this is the last user message)
              const lastUserMessageIndex = messages.map((m, idx) => m.role === "user" ? idx : -1).filter(idx => idx !== -1).pop();
              const isLastUserMessage = message.role === "user" && lastUserMessageIndex !== undefined && index === lastUserMessageIndex;
              
              // Check if this is the currently streaming assistant message
              const isLastAssistantMessage = message.role === "assistant" && index === messages.length - 1;
              const isStreaming = isLastAssistantMessage && (isLoading || isProcessing) && message.content && message.content.length > 0;
              
              // Check if message contains a table (markdown table pattern)
              const hasTable = message.content && /(\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/.test(message.content);

              return (
              <div
                key={messageKey}
                ref={isLastUserMessage ? lastUserMessageRef : null}
                className={`flex mb-8 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`${
                    message.role === "user" ? "" : hasTable ? "max-w-full" : "max-w-[92%]"
                  } group relative ${
                    message.role === "assistant"
                      ? "pr-3 py-3 rounded-r-sm"
                      : ""
                  }`}
                  style={message.role === "assistant" ? {
                    animation: 'fadeInAssistant 0.8s ease-out forwards',
                    willChange: 'opacity',
                    maxWidth: hasTable ? '100%' : 'min(92%, 70ch)', // Full width for tables, optimal reading width otherwise
                  } : {
                    animation: 'fadeIn 0.3s ease-in-out',
                    animationFillMode: 'backwards',
                    animationDelay: `${index * 0.05}s`,
                    maxWidth: 'min(92.625%, 80.275ch)', // Extended width for better readability
                  }}
                >
                  {/* Formatted Search Response */}
                  {message.role === "assistant" && message.formattedSearch && (
                    <FormattedSearchResponse 
                      searchData={message.formattedSearch} 
                      userQuery={message.userQuery}
                      content={message.content}
                    />
                  )}
                  
                  {/* Images section - only for assistant messages (fallback if no formatted search) */}
                  {message.role === "assistant" && !message.formattedSearch && message.images && message.images.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {message.images.map((image, idx) => (
                        image.thumbnail?.src ? (
                          <a
                            key={idx}
                            href={image.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={image.thumbnail.src}
                              alt={image.title || `Image ${idx + 1}`}
                              className="h-24 w-24 object-cover rounded border border-border/50 cursor-pointer"
                              loading="lazy"
                            />
                          </a>
                        ) : null
                      ))}
                    </div>
                  )}
                  {/* Watch section - videos for assistant messages (fallback if no formatted search) */}
                  {message.role === "assistant" && !message.formattedSearch && message.videos && message.videos.length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm text-muted-foreground mb-2 font-medium">Watch</div>
                      <div className="flex flex-wrap gap-2">
                        {message.videos.map((video, idx) => (
                          video.thumbnail?.src ? (
                            <a
                              key={idx}
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block hover:opacity-80 transition-opacity group relative"
                            >
                              <div className="relative">
                                <img
                                  src={video.thumbnail.src}
                                  alt={video.title || `Video ${idx + 1}`}
                                  className="h-32 w-48 object-cover rounded border border-border/50 cursor-pointer"
                                  loading="lazy"
                                />
                                {/* Play icon overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded">
                                  <svg
                                    className="w-8 h-8 text-white opacity-90"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                                {/* Duration badge */}
                                {video.duration && (
                                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                    {video.duration}
                                  </div>
                                )}
                              </div>
                              {video.title && (
                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2 max-w-[192px]">
                                  {video.title}
                                </div>
                              )}
                            </a>
                          ) : null
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Regular content (only show if no formatted search) */}
                  {!message.formattedSearch && (hasContent || (hasToolCalls && message.role === "assistant") || isCurrentlyStreaming || isStreaming) && (
                    <div className={message.role === "user" ? "space-y-1" : "space-y-0"}>
                      {/* Interleaved content and tool execution for assistant messages */}
                      {message.role === "assistant" && message.contentParts && message.contentParts.length > 0 ? (
                        <div className="space-y-0">
                          {(() => {
                            // Merge adjacent text parts to prevent duplication
                            const mergedParts: typeof message.contentParts = [];
                            for (let i = 0; i < message.contentParts.length; i++) {
                              const part = message.contentParts[i];
                              if (part.type === 'text') {
                                // If last merged part is also text, merge them
                                const lastMerged = mergedParts[mergedParts.length - 1];
                                if (lastMerged && lastMerged.type === 'text') {
                                  lastMerged.content += part.content;
                                } else {
                                  mergedParts.push({ ...part });
                                }
                              } else {
                                mergedParts.push(part);
                              }
                            }
                            
                            // Separate text and tool parts
                            const textParts = mergedParts.filter(p => p.type === 'text');
                            const toolParts = mergedParts.filter(p => p.type === 'tool');
                            
                            // Extract tables from text parts that come before tool parts
                            // Tables are markdown tables (lines starting with |)
                            const textWithoutTables: typeof textParts = [];
                            const extractedTables: Array<{ content: string; originalTextIdx: number }> = [];
                            
                            textParts.forEach((textPart, idx) => {
                              const lines = textPart.content.split('\n');
                              const textLines: string[] = [];
                              let currentTable: string[] = [];
                              let inTable = false;
                              let tableHeading: string | null = null;
                              
                              lines.forEach((line, lineIdx) => {
                                const trimmed = line.trim();
                                const isTableLine = trimmed.startsWith('|') && trimmed.includes('|');
                                const isTableHeader = trimmed.match(/^\|[\s\-\|:]+\|$/); // Separator row like |---|---|
                                const isHeading = trimmed.startsWith('###') || trimmed.startsWith('##');
                                
                                if (isTableLine || isTableHeader) {
                                  if (!inTable) {
                                    inTable = true;
                                    currentTable = [];
                                    // Check if previous line was a heading (like "### Contents")
                                    if (lineIdx > 0 && textLines.length > 0) {
                                      const prevLine = textLines[textLines.length - 1].trim();
                                      if (prevLine.startsWith('###') || prevLine.startsWith('##')) {
                                        tableHeading = textLines.pop() || null;
                                      }
                                    }
                                  }
                                  currentTable.push(line);
                                } else {
                                  if (inTable) {
                                    // End of table - save it with heading if present
                                    if (currentTable.length > 0) {
                                      const tableContent = tableHeading 
                                        ? `${tableHeading}\n\n${currentTable.join('\n')}`
                                        : currentTable.join('\n');
                                      extractedTables.push({
                                        content: tableContent,
                                        originalTextIdx: idx
                                      });
                                    }
                                    currentTable = [];
                                    tableHeading = null;
                                    inTable = false;
                                  }
                                  textLines.push(line);
                                }
                              });
                              
                              // Handle table at end of content
                              if (inTable && currentTable.length > 0) {
                                const tableContent = tableHeading 
                                  ? `${tableHeading}\n\n${currentTable.join('\n')}`
                                  : currentTable.join('\n');
                                extractedTables.push({
                                  content: tableContent,
                                  originalTextIdx: idx
                                });
                              }
                              
                              // Create text part without tables
                              const textWithoutTable = textLines.join('\n').trim();
                              if (textWithoutTable) {
                                textWithoutTables.push({
                                  ...textPart,
                                  content: textWithoutTable
                                });
                              } else if (textLines.length > 0) {
                                // Keep even if empty after trimming (preserve structure)
                                textWithoutTables.push({
                                  ...textPart,
                                  content: textLines.join('\n')
                                });
                              }
                            });
                            
                            // Reorder: text without tables first, then tool parts, then extracted tables
                            const reorderedParts: Array<typeof message.contentParts[0] | { type: 'extracted-table'; content: string }> = [
                              ...textWithoutTables,
                              ...toolParts,
                              ...extractedTables.map(t => ({ type: 'extracted-table' as const, content: t.content }))
                            ];
                            
                            return reorderedParts;
                          })().map((part, partIdx, reorderedParts) => {
                            if (part.type === 'text') {
                              return (
                                <div
                                  key={`text-${partIdx}`}
                                  data-message-id={`${message.id}-${partIdx}`}
                                  className={`break-words text-[15px] text-foreground/90 text-left max-w-none ${animationClass}`}
                                  style={{
                                    lineHeight: "1.8",
                                    whiteSpace: "pre-wrap",
                                    wordSpacing: "normal",
                                    letterSpacing: "0.01em",
                                    textAlign: "left",
                                    wordBreak: "normal",
                                    overflowWrap: "normal",
                                  } as React.CSSProperties}
                                >
                                  {part.content && part.content.trim().length > 0 ? formatMessageContent(
                                    part.content
                                      .replace(/\bImagen\s*4\b/gi, '')
                                      .replace(/\bImagen\b/gi, '')
                                      .replace(/Generated\s+\d+\s+image\(s\)/gi, '')
                                      .replace(/I've\s+generated\s+\d+\s+image/i, '')
                                      .replace(/Here's?\s+the\s+generated\s+image/i, '')
                                      .trim(),
                                    openFile,
                                    handleFileOpen
                                  ) : null}
                                </div>
                              );
                            } else if (part.type === 'tool') {
                              // Count how many tools have appeared before this one in the reordered array
                              const toolIndex = reorderedParts.slice(0, partIdx + 1).filter(p => p.type === 'tool').length;
                              return (
                                <ToolExecutionStep
                                  key={`tool-${partIdx}`}
                                  name={part.name}
                                  args={part.args}
                                  response={part.response}
                                  status={part.status}
                                  index={toolIndex}
                                />
                              );
                            } else if ('type' in part && part.type === 'extracted-table') {
                              // Render extracted table after tool execution steps
                              return (
                                <div key={`extracted-table-${partIdx}`} className="my-4">
                                  {formatMessageContent(
                                    part.content,
                                    openFile,
                                    handleFileOpen
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ) : (
                        /* Fallback for messages without contentParts (user messages or old messages) */
                        <div
                          data-message-id={message.id}
                          className={`break-words ${
                            message.role === "user"
                              ? "text-lg font-medium text-yellow-100 text-left w-full"
                              : `text-[15px] text-foreground/90 text-left max-w-none ${animationClass}`
                          }`}
                          style={{
                            lineHeight: message.role === "user" ? "1.5" : "1.8",
                            whiteSpace: message.role === "user" ? "normal" : "pre-wrap",
                            wordSpacing: "normal",
                            letterSpacing: message.role === "user" ? "0" : "0.01em",
                            textAlign: message.role === "user" ? "left" : "left",
                            wordBreak: message.role === "user" ? "break-word" : "normal",
                            overflowWrap: message.role === "user" ? "break-word" : "normal",
                          } as React.CSSProperties}
                        >
                          {message.content && message.content.trim().length > 0 ? formatMessageContent(
                            message.role === "user"
                              ? preventOrphanedWords(
                                  // Filter out "Imagen 4" or "Imagen" references and generation messages from content
                                  message.content
                                    .replace(/\bImagen\s*4\b/gi, '')
                                    .replace(/\bImagen\b/gi, '')
                                    .replace(/Generated\s+\d+\s+image\(s\)/gi, '')
                                    .replace(/I've\s+generated\s+\d+\s+image/i, '')
                                    .replace(/Here's?\s+the\s+generated\s+image/i, '')
                                    .trim()
                                )
                              : message.content
                                  .replace(/\bImagen\s*4\b/gi, '')
                                  .replace(/\bImagen\b/gi, '')
                                  .replace(/Generated\s+\d+\s+image\(s\)/gi, '')
                                  .replace(/I've\s+generated\s+\d+\s+image/i, '')
                                  .replace(/Here's?\s+the\s+generated\s+image/i, '')
                                  .trim(),
                            openFile,
                            handleFileOpen
                          ) : (hasToolCalls || isCurrentlyStreaming || isStreaming) && message.role === "assistant" ? (
                            <ProcessingIndicator />
                          ) : null}
                        </div>
                      )}
                      {/* Timestamp - only for assistant, hide while streaming */}
                      {message.role === "assistant" && !isStreaming && (
                        <div className="flex items-center justify-between gap-3 mt-3">
                          <div className="text-xs text-muted-foreground/60">
                            {formatTimestamp(message.timestamp)}
                          </div>
                          {/* Action icons */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content);
                              }}
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Copy message"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                            </button>
                            {speakingMessageId === message.id ? (
                              <>
                                {isPaused ? (
                                  <button
                                    onClick={resumeSpeaking}
                                    className="p-1.5 hover:bg-muted rounded transition-colors"
                                    title="Resume"
                                  >
                                    <Play className="h-3.5 w-3.5 text-primary" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={pauseSpeaking}
                                    className="p-1.5 hover:bg-muted rounded transition-colors"
                                    title="Pause"
                                  >
                                    <Pause className="h-3.5 w-3.5 text-primary" />
                                  </button>
                                )}
                                <button
                                  onClick={stopSpeaking}
                                  className="p-1.5 hover:bg-muted rounded transition-colors"
                                  title="Stop speaking"
                                >
                                  <Volume2 className="h-3.5 w-3.5 text-primary opacity-50" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => speakMessage(message.id, message.content)}
                                className="p-1.5 hover:bg-muted rounded transition-colors"
                                title="Read aloud"
                              >
                                <Volume2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                              </button>
                            )}
                            <button
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Good response"
                            >
                              <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-green-500" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Bad response"
                            >
                              <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Timestamp and actions for formatted search, hide while streaming */}
                  {message.formattedSearch && !isStreaming && (
                    <div className="flex items-center justify-between gap-3 mt-4">
                      <div className="text-xs text-muted-foreground/60">
                        {formatTimestamp(message.timestamp)}
                      </div>
                      {/* Action icons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                          }}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Copy message"
                        >
                          <Copy className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                        </button>
                        {speakingMessageId === message.id ? (
                          <button
                            onClick={stopSpeaking}
                            className="p-1.5 hover:bg-muted rounded transition-colors"
                            title="Stop speaking"
                          >
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                          </button>
                        ) : (
                          <button
                            onClick={() => speakMessage(message.id, message.content)}
                            className="p-1.5 hover:bg-muted rounded transition-colors"
                            title="Read aloud"
                          >
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                          </button>
                        )}
                        <button
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-green-500" />
                        </button>
                        <button
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            {/* Processing Indicator - only show if no assistant message exists yet (before first tool call or content) */}
            {isProcessing && (() => {
              // Find the last assistant message to check if it exists
              const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
              // Only show bottom indicator if no assistant message exists yet (before message container is created)
              return !lastAssistantMessage;
            })() && (
              <div className="flex justify-start mb-6">
                <div className="max-w-[85%]">
                  <ProcessingIndicator />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area - Sticky Footer */}
      <div 
        className="flex-shrink-0 border-t border-background bg-background relative z-10 mobile-safari-input-fix"
        style={{
          paddingTop: '1rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingBottom: 'calc(1rem + max(3rem, env(safe-area-inset-bottom, 3rem)))',
          position: 'relative',
        }}
      >
        <div className="relative mx-auto max-w-5xl w-full space-y-2">
          {/* Attached PDFs - Only render on client to prevent hydration issues */}
          {isMounted && attachedPDFs.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {attachedPDFs.map((pdf, index) => {
                // Use a stable key based on PDF data to avoid hydration issues
                const pdfKey = pdf.data ? `${pdf.type}-${pdf.data.substring(0, 20)}-${index}` : `pdf-${index}`;
                return (
                  <div
                    key={pdfKey}
                    className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-xs"
                  >
                    <span className="truncate max-w-[150px]" title={pdf.displayName}>
                      {pdf.displayName || `PDF ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        const updated = attachedPDFs.filter((_, i) => i !== index);
                        setAttachedPDFs(updated);
                      }}
                      className="hover:text-destructive transition-colors shrink-0"
                      disabled={isLoading}
                      aria-label="Remove PDF"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Type your message..."
              className="min-h-[60px] max-h-[200px] resize-none pl-14 pr-20 py-3 leading-normal text-yellow-100 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5',
              }}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading || !authLoaded || !userId}
            />
            <ArrowUp
              onClick={() => handleSubmit()}
              className={`absolute top-1/2 -translate-y-1/2 left-3 h-6 w-6 text-orange-500 transition-opacity ${
                isLoading || !authLoaded || !userId || (!input.trim() && attachedPDFs.length === 0)
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:opacity-80"
              }`}
            />
            <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
              {/* Browser feature disabled */}
              {/* <Button
                variant="ghost"
                size="icon"
                onClick={() => openBrowser("https://www.google.com", "Browser")}
                className="h-8 w-8 hover:bg-accent"
                title="Open Browser"
              >
                <Globe className="h-4 w-4" />
              </Button> */}
              <CommandsButton className="h-8 w-8 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-accent transition-all duration-200" />
              <PDFUploadIcon
                onPDFsChange={setAttachedPDFs}
                existingPDFs={attachedPDFs}
                maxFiles={5}
                uploading={uploadingPDFs}
                onUploadingChange={setUploadingPDFs}
                disabled={!authLoaded || !userId}
              />
              <SignedIn>
                {!editorState.isOpen && <UserButtonWithClear />}
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </div>
    {browserState.isOpen ? (
      browserState.sid ? (
        <BrowserPanel 
          sid={browserState.sid}
          allowExecute={true}
          onClose={closeBrowser}
        />
      ) : browserState.url ? (
        <BrowserViewer 
          url={browserState.url}
          title={browserState.title}
          onClose={closeBrowser}
        />
      ) : null
    ) : videoState.isOpen && videoState.videoUrl ? (
      <VideoViewer 
        videoUrl={videoState.videoUrl} 
        videoTitle={videoState.videoTitle}
        onClose={closeVideo} 
      />
    ) : imageState.isOpen && imageState.imageUrl ? (
      <ImageViewer imageUrl={imageState.imageUrl} onClose={closeImage} />
    ) : (
      <CodeMirrorEditor />
    )}
    </SplitView>
    <Dialog open={!!fileError} onOpenChange={(open) => !open && setFileError(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {fileError?.reason || 'Error Opening File'}
          </DialogTitle>
          <DialogDescription className="pt-2">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {fileError?.message}
              </p>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {fileError?.path}
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setFileError(null)} variant="default">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

