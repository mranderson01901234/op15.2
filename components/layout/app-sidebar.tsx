"use client";

import { Sidebar, SidebarContent, SidebarHeader, SidebarRail, SidebarTrigger, SidebarFooter } from "@/components/ui/sidebar";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "@/components/ui/sidebar";
import { AgentStatusFooter } from "@/components/local-env/agent-status-footer";
import { LocalEnvToggle } from "@/components/local-env/local-env-toggle";
import { LocalEnvConnector } from "@/components/local-env/local-env-connector";
import { cn } from "@/lib/utils";

// LLM Assistant logo SVG component
function AssistantIcon() {
  return (
    <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8 transition-all duration-200">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5 text-primary transition-transform duration-200 group-hover:scale-110"
      >
        <path d="M12 3v18" />
        <path d="M3 12h18" />
        <path d="m5.6 5.6 12.8 12.8" />
        <path d="m5.6 18.4 12.8-12.8" />
      </svg>
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarRail />
      <SidebarHeader className="border-b border-sidebar-border/50 bg-sidebar/30 py-4 transition-all duration-200">
        <div className="flex items-center justify-between gap-3 group-data-[collapsible=icon]:justify-center group">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center min-w-0">
            <AssistantIcon />
            <span className={cn(
              "text-lg font-semibold text-foreground transition-opacity duration-200",
              isCollapsed ? "sr-only" : "opacity-100"
            )}>
              LLM Assistant
            </span>
          </div>
          <SidebarTrigger className={cn(
            "h-7 w-7 shrink-0 transition-all duration-200",
            isCollapsed && "group-data-[collapsible=icon]:mx-auto"
          )} />
        </div>
      </SidebarHeader>
      <SidebarContent className="flex-1 min-h-0 overflow-hidden invisible-scrollbar flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          <SidebarNav />
        </div>
        <div className="shrink-0 border-t border-sidebar-border/50">
          <LocalEnvConnector isCollapsed={isCollapsed} />
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/50">
        <LocalEnvToggle />
        <AgentStatusFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
