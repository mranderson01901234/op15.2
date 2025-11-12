"use client";

import { CommandsButton } from "./commands-button";
import { useWorkspace } from "@/contexts/workspace-context";

/**
 * Conditionally shows CommandsButton only when editor is closed
 * When editor is open, CommandsButton is shown in the editor header instead
 */
export function ConditionalCommandsButton() {
  const { editorState } = useWorkspace();
  
  // Only show floating button when editor is closed
  if (editorState.isOpen) {
    return null;
  }
  
  return (
    <CommandsButton className="fixed top-4 right-4 z-50 h-9 w-9 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-accent transition-all duration-200" />
  );
}

