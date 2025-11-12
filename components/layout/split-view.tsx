"use client";

import { ReactNode, Children, useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/workspace-context";

interface SplitViewProps {
  children: ReactNode;
}

export function SplitView({ children }: SplitViewProps) {
  const { editorState, imageState, videoState, browserState } = useWorkspace();
  const isEditorOpen = editorState.isOpen;
  const isImageOpen = imageState.isOpen;
  const isVideoOpen = videoState.isOpen;
  const isBrowserOpen = browserState.isOpen;
  const isRightPanelOpen = isEditorOpen || isImageOpen || isVideoOpen || isBrowserOpen;
  
  // Split ratio: 0.5 = 50/50, stored as percentage of left panel
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const childrenArray = Children.toArray(children);
  if (childrenArray.length !== 2) {
    throw new Error("SplitView requires exactly 2 children");
  }

  // Reset to 50/50 when editor, image, video, or browser opens
  useEffect(() => {
    if (isRightPanelOpen) {
      setSplitRatio(0.5);
    }
  }, [isRightPanelOpen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      // Calculate new split ratio (clamp between 0.2 and 0.8 for usability)
      const newRatio = Math.max(0.2, Math.min(0.8, mouseX / containerWidth));
      setSplitRatio(newRatio);
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="flex h-full relative"
    >
      {/* Chat Panel */}
      <div
        className={cn(
          "min-w-0 overflow-hidden",
          !isDragging && "transition-all duration-300 ease-in-out",
          !isRightPanelOpen && "flex-1"
        )}
        style={{
          width: isRightPanelOpen ? `${splitRatio * 100}%` : "100%",
        }}
      >
        {childrenArray[0]}
      </div>

      {/* Draggable Divider */}
      {isRightPanelOpen && (
        <div
          ref={dividerRef}
          onMouseDown={handleMouseDown}
          className={cn(
            "w-1 bg-border hover:bg-primary/30 cursor-col-resize transition-colors relative z-10 flex-shrink-0 group",
            isDragging && "bg-primary/50"
          )}
          style={{
            minWidth: "4px",
          }}
        >
          {/* Invisible hit area for easier grabbing */}
          <div className="absolute inset-y-0 -inset-x-2 cursor-col-resize" />
          {/* Visual indicator */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-border group-hover:bg-primary/50 transition-colors" />
        </div>
      )}

      {/* Right Panel (Editor, Image Viewer, Video Viewer, or Browser) */}
      <div
        className={cn(
          "min-w-0 overflow-hidden",
          !isDragging && "transition-all duration-300 ease-in-out",
          !isRightPanelOpen && "w-0"
        )}
        style={{
          width: isRightPanelOpen ? `${(1 - splitRatio) * 100}%` : "0%",
        }}
      >
        {isRightPanelOpen && childrenArray[1]}
      </div>
    </div>
  );
}

