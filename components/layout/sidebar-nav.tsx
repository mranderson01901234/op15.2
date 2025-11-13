"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Plus, X, FolderOpen, ChevronDown } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenuAction, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { FileTree } from "@/components/filesystem/file-tree";
import { useWorkspace } from "@/contexts/workspace-context";
import { useChat } from "@/contexts/chat-context";
import { useAuth } from "@clerk/nextjs";

type TabType = "chats" | "filesystem";

export function SidebarNav() {
  const [rootPath, setRootPath] = useState<string>(".");
  const [selectedDirPath, setSelectedDirPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("chats");
  const [isHovered, setIsHovered] = useState(false);
  const { selectedPath, setSelectedPath, openFile } = useWorkspace();
  const { chats, activeChatId, createChat, deleteChat, setActiveChat } = useChat();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { userId, isLoaded: authLoaded } = useAuth();

  useEffect(() => {
    // Check for browser bridge selected directory
    const storedSelectedDir = localStorage.getItem('localEnvSelectedDir');
    if (storedSelectedDir) {
      setSelectedDirPath(storedSelectedDir);
      setRootPath(storedSelectedDir);
    } else {
      // Only fetch the environment root path if user is authenticated and no browser bridge dir
      if (!authLoaded) return;
      
      if (!userId) {
        // User is signed out - clear the root path
        setRootPath(".");
        setSelectedDirPath(null);
        return;
      }

      // User is authenticated - fetch the root path
      fetch("/api/filesystem/root")
        .then((res) => res.json())
        .then((data) => {
          if (data.rootPath) {
            setRootPath(data.rootPath);
          }
        })
        .catch((error) => {
          console.error("Failed to load root path:", error);
        });
    }

    // Listen for browser bridge directory changes
    const handleDirChange = (e: CustomEvent<{ path: string | null }>) => {
      if (e.detail.path) {
        setSelectedDirPath(e.detail.path);
        setRootPath(e.detail.path);
      } else {
        setSelectedDirPath(null);
        // Fall back to workspace root
        if (authLoaded && userId) {
          fetch("/api/filesystem/root")
            .then((res) => res.json())
            .then((data) => {
              if (data.rootPath) {
                setRootPath(data.rootPath);
              }
            })
            .catch((error) => {
              console.error("Failed to load root path:", error);
            });
        }
      }
    };
    window.addEventListener('localEnvDirChanged', handleDirChange as EventListener);
    return () => window.removeEventListener('localEnvDirChanged', handleDirChange as EventListener);
  }, [authLoaded, userId]);

  const handleFileSelect = async (path: string) => {
    setSelectedPath(path);
    
    try {
      // Read file content
      const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error("Failed to read file");
      }
      
      const data = await response.json();
      // Open file in editor
      openFile(path, data.content);
    } catch (error) {
      console.error("Error opening file:", error);
    }
  };

  const handleNewChat = () => {
    // Don't allow creating chats if user is not authenticated
    if (!authLoaded || !userId) {
      return;
    }
    createChat();
  };

  const handleChatSelect = (chatId: string) => {
    setActiveChat(chatId);
  };

  const handleChatDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    deleteChat(chatId);
  };

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="h-full flex flex-col"
    >
      {/* Tab Navigation */}
      <div className={cn(
        "flex border-b border-sidebar-border bg-sidebar/50",
        isCollapsed && "flex-col border-b-0 border-r"
      )}>
        <button
          onClick={() => setActiveTab("chats")}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium",
            "transition-all duration-300 ease-in-out border-b-2 relative",
            isCollapsed ? "w-full border-b-0 border-r-2" : "flex-1",
            activeTab === "chats"
              ? "border-primary text-sidebar-foreground bg-sidebar-accent/50"
              : "border-transparent text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
          )}
          title={isCollapsed ? "Chats" : undefined}
        >
          <MessageSquare className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            activeTab === "chats" && "scale-110"
          )} />
          {!isCollapsed && <span>Chats</span>}
        </button>
        <button
          onClick={() => setActiveTab("filesystem")}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium",
            "transition-all duration-300 ease-in-out border-b-2 relative",
            isCollapsed ? "w-full border-b-0 border-r-2" : "flex-1",
            activeTab === "filesystem"
              ? "border-primary text-sidebar-foreground bg-sidebar-accent/50"
              : "border-transparent text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
          )}
          title={isCollapsed ? (selectedDirPath || "Files") : undefined}
        >
          <FolderOpen className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            activeTab === "filesystem" && "scale-110"
          )} />
          {!isCollapsed && (
            <span className="truncate">
              {selectedDirPath ? `/${selectedDirPath}` : "Files"}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "chats" ? (
          <>
            <SidebarMenu className="mt-2">
              <SidebarMenuItem className={cn(isCollapsed && "flex justify-center")}>
                <SidebarMenuButton 
                  size="default" 
                  onClick={handleNewChat}
                  disabled={!authLoaded || !userId}
                  className={cn(
                    "w-full",
                    isCollapsed && "w-auto justify-center",
                    (!authLoaded || !userId) && "opacity-50 cursor-not-allowed"
                  )}
                  tooltip="New Chat"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>New Chat</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* Chat List */}
            {chats.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {chats.map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <SidebarMenuButton
                          onClick={() => handleChatSelect(chat.id)}
                          isActive={activeChatId === chat.id}
                          tooltip={chat.title}
                        >
                          <MessageSquare className="h-4 w-4" />
                          <span>{chat.title}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          onClick={(e) => handleChatDelete(e, chat.id)}
                          showOnHover
                          aria-label="Delete chat"
                        >
                          <X className="h-3 w-3" />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        ) : (
          !isCollapsed && (
            <div className="flex flex-col h-full relative">
              {/* File tree container that scrolls under bottom section */}
              <div className="flex-1 min-h-0 relative overflow-hidden">
                <div className="h-full overflow-y-auto premium-scrollbar pb-[25%]">
                  <SidebarGroupContent className="pt-2">
                    <FileTree 
                      rootPath={rootPath}
                      onFileSelect={handleFileSelect}
                      selectedPath={selectedPath || undefined}
                    />
                  </SidebarGroupContent>
                </div>
                {/* Bottom overlay section (25% height) with dropdown arrow */}
                <div className="absolute bottom-0 left-0 right-0 h-[25%] pointer-events-none flex items-end justify-center pb-2 bg-gradient-to-t from-sidebar via-sidebar/50 to-transparent">
                  <div className="pointer-events-auto">
                    <ChevronDown className={`h-5 w-5 text-muted-foreground ${isHovered ? 'animate-bounce' : ''}`} />
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

    </div>
  );
}

