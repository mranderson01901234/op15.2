"use client";

import { useState, useEffect } from "react";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useChatInput } from "@/contexts/chat-input-context";

interface CommandSection {
  title: string;
  commands: Array<{
    key: string;
    description: string;
  }>;
}

const commandSections: CommandSection[] = [
  {
    title: "File System",
    commands: [
      { key: "list files", description: "List all files in the current directory" },
      { key: "list files in /path", description: "List files in a specific directory" },
      { key: "summarize this file", description: "Generate a summary of the currently open file" },
      { key: "read file /path/to/file", description: "Read and display file contents" },
    ],
  },
  {
    title: "System",
    commands: [
      { key: "check GPU", description: "Check GPU status and availability" },
      { key: "system info", description: "Display system information" },
      { key: "check memory", description: "Show memory usage statistics" },
      { key: "check disk space", description: "Display disk usage information" },
    ],
  },
  {
    title: "AI Generation",
    commands: [
      { key: "generate an image", description: "Generate an image using AI" },
      { key: "generate an image of [description]", description: "Generate an image from text description" },
      { key: "explain this code", description: "Explain the code in the current file" },
      { key: "refactor this code", description: "Refactor code in the current file" },
    ],
  },
  {
    title: "Code Analysis",
    commands: [
      { key: "find bugs in this file", description: "Analyze code for potential bugs" },
      { key: "suggest improvements", description: "Get suggestions for code improvements" },
      { key: "generate tests", description: "Generate unit tests for the current file" },
      { key: "document this code", description: "Generate documentation for the code" },
    ],
  },
];

interface CommandsButtonProps {
  className?: string;
}

export function CommandsButton({ className }: CommandsButtonProps = { className: undefined }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { sendMessage } = useChatInput();

  // Prevent hydration mismatch by only rendering Sheet after client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCommandClick = (command: string) => {
    sendMessage(command);
    setOpen(false);
  };

  // Render button without Sheet during SSR to prevent hydration mismatch
  // useEffect will set mounted=true after client-side hydration
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className || "h-8 w-8 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-accent transition-all duration-200"}
        aria-label="Show commands"
        disabled
      >
        <Command className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className || "h-8 w-8 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-accent transition-all duration-200"}
          aria-label="Show commands"
        >
          <Command className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[340px] overflow-y-auto p-0 border-l border-border/50 bg-background">
        <div className="h-full flex flex-col">
          {/* Premium Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border/30 bg-gradient-to-b from-background to-background/95">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-500/80 shadow-sm shadow-orange-500/50"></div>
              <SheetTitle className="text-lg font-semibold tracking-tight text-foreground">
                Commands
              </SheetTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Available LLM commands
            </p>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {commandSections.map((section, sectionIndex) => (
              <div
                key={sectionIndex}
                className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden hover:border-border/60 transition-all duration-200"
              >
                {/* Card Header */}
                <div className="px-4 py-2.5 bg-gradient-to-r from-muted/40 via-muted/30 to-transparent border-b border-border/30">
                  <h3 className="text-xs font-semibold text-foreground tracking-wide uppercase">
                    {section.title}
                  </h3>
                </div>
                
                {/* Card Content */}
                <div className="p-2 space-y-1">
                  {section.commands.map((command, cmdIndex) => (
                    <button
                      key={cmdIndex}
                      onClick={() => handleCommandClick(command.key)}
                      className="group relative w-full text-left px-3 py-2 rounded-md hover:bg-muted/40 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <div className="flex flex-col gap-1.5">
                        <kbd className="text-xs font-mono font-medium text-foreground/90 px-2 py-1 bg-background/80 border border-border/40 rounded-md shadow-sm group-hover:border-border/60 group-hover:bg-background transition-colors">
                          {command.key}
                        </kbd>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-0.5">
                          {command.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border/30 bg-gradient-to-t from-background to-background/95">
            <p className="text-xs text-muted-foreground text-center">
              Type commands in chat to execute
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

