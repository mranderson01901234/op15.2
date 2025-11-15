"use client";

import { MessageSquare, FileText, Code, Image as ImageIcon, Video, Globe, FolderTree } from "lucide-react";
import { useWorkspace, type MobilePanelType } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";

interface NavItem {
  id: MobilePanelType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
  },
  {
    id: "files",
    label: "Files",
    icon: FolderTree,
  },
  {
    id: "editor",
    label: "Editor",
    icon: Code,
  },
];

export function MobileBottomNav() {
  const { activeMobilePanel, setActiveMobilePanel, editorState, imageState, videoState, browserState } = useWorkspace();

  // Determine which panel to show based on what's open
  // Priority: browser > video > image > editor
  let activeIcon = Code;
  let activeLabel = "Editor";

  if (browserState.isOpen) {
    activeIcon = Globe;
    activeLabel = "Browser";
  } else if (videoState.isOpen) {
    activeIcon = Video;
    activeLabel = "Video";
  } else if (imageState.isOpen) {
    activeIcon = ImageIcon;
    activeLabel = "Image";
  } else if (editorState.isOpen) {
    activeIcon = Code;
    activeLabel = "Editor";
  }

  // Dynamic third button based on active panel
  const thirdButton: NavItem = {
    id: browserState.isOpen ? "browser" : videoState.isOpen ? "video" : imageState.isOpen ? "image" : "editor",
    label: activeLabel,
    icon: activeIcon,
  };

  const displayItems = [navItems[0], navItems[1], thirdButton];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-around h-16 px-2 safe-area-inset-bottom">
        {displayItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeMobilePanel === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveMobilePanel(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-all duration-200",
                "min-h-[44px] min-w-[44px] touch-manipulation", // Touch target optimization
                isActive
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent/70"
              )}
              aria-label={item.label}
            >
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
