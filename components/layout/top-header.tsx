"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, useAuth } from '@clerk/nextjs';
import { useClerk } from '@clerk/nextjs';
import { useChat } from '@/contexts/chat-context';
import { useState, useEffect } from 'react';

const STORAGE_KEY = "op15-chats";
const ACTIVE_CHAT_KEY = "op15-active-chat-id";

export function TopHeader() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { signOut } = useClerk();
  const { chats, deleteChat, setActiveChat } = useChat();
  const [workspaceRoot, setWorkspaceRoot] = useState<string>("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Fetch workspace root when authenticated
  useEffect(() => {
    if (!authLoaded) return;
    
    if (!userId) {
      setWorkspaceRoot("");
      return;
    }

    // Check for browser bridge selected directory first
    const storedSelectedDir = localStorage.getItem('localEnvSelectedDir');
    if (storedSelectedDir) {
      setWorkspaceRoot(storedSelectedDir);
      return;
    }

    // Fetch workspace root from API
    fetch("/api/filesystem/root")
      .then((res) => res.json())
      .then((data) => {
        if (data.rootPath) {
          setWorkspaceRoot(data.rootPath);
        }
      })
      .catch((error) => {
        console.error("Failed to load workspace root:", error);
      });

    // Listen for browser bridge directory changes
    const handleDirChange = (e: CustomEvent<{ path: string | null }>) => {
      if (e.detail.path) {
        setWorkspaceRoot(e.detail.path);
      } else {
        // Fall back to workspace root
        fetch("/api/filesystem/root")
          .then((res) => res.json())
          .then((data) => {
            if (data.rootPath) {
              setWorkspaceRoot(data.rootPath);
            }
          })
          .catch((error) => {
            console.error("Failed to load workspace root:", error);
          });
      }
    };

    window.addEventListener('localEnvDirChanged', handleDirChange as EventListener);
    return () => {
      window.removeEventListener('localEnvDirChanged', handleDirChange as EventListener);
    };
  }, [authLoaded, userId]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      // Clear all chats from state
      const chatsToDelete = [...chats];
      chatsToDelete.forEach((chat) => {
        deleteChat(chat.id);
      });
      // Clear active chat
      setActiveChat(null);
      
      // Clear localStorage
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_CHAT_KEY);
        // Clear all op15-related keys
        localStorage.removeItem('op15-local-env-enabled');
        localStorage.removeItem('op15-agent-installed');
        localStorage.removeItem('localEnvSelectedDir');
        localStorage.removeItem('localEnvUserId');
        // Clear any other op15 keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        console.error("Failed to clear localStorage on sign out:", error);
      }

      // Sign out from Clerk
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  // Remove leading slash from workspace root for display
  const displayRoot = workspaceRoot?.startsWith('/') ? workspaceRoot.slice(1) : workspaceRoot;

  return (
    <div 
      className="fixed top-4 right-4 flex items-center gap-3"
      style={{
        zIndex: 9999,
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        WebkitTransform: 'translateZ(0)', // Force hardware acceleration for Safari
        transform: 'translateZ(0)',
      }}
    >
      {/* Signed Out: Show Sign In / Start for Free */}
      <SignedOut>
        <SignInButton mode="modal">
          <button 
            className="px-4 py-2 text-sm font-medium bg-sidebar text-sidebar-foreground rounded-md hover:bg-sidebar/90 transition-colors border border-border/50 shadow-lg"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button 
            className="px-4 py-2 text-sm font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors shadow-lg font-semibold"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              cursor: 'pointer',
            }}
          >
            Start for free
          </button>
        </SignUpButton>
      </SignedOut>

      {/* Signed In: Show Workspace Root + Sign Out */}
      <SignedIn>
        {displayRoot && (
          <div className="px-2 py-1 text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={workspaceRoot}>
            {displayRoot}
          </div>
        )}
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="px-2 py-1 text-xs font-medium text-foreground hover:text-foreground/80 transition-colors disabled:opacity-50"
        >
          {isSigningOut ? "Signing out..." : "Sign Out"}
        </button>
      </SignedIn>
    </div>
  );
}

