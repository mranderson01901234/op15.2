"use client";

import { useEffect, useRef } from "react";
import { UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { useChat } from "@/contexts/chat-context";

const STORAGE_KEY = "op15-chats";
const ACTIVE_CHAT_KEY = "op15-active-chat-id";

/**
 * UserButton wrapper that clears chat history when user signs out
 * This ensures that when a user logs out, their previous session's chat
 * messages are cleared from the UI and localStorage
 */
export function UserButtonWithClear() {
  const { userId, isLoaded } = useAuth();
  const { chats, deleteChat, setActiveChat } = useChat();
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const chatsRef = useRef(chats);

  // Keep chats ref up to date
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // Watch for sign out - when userId becomes null, clear all chats
  useEffect(() => {
    // Only run after auth is loaded to avoid false positives
    if (!isLoaded) return;

    const previousUserId = previousUserIdRef.current;
    const currentUserId = userId;

    // If user was signed in (had a userId) and now is signed out (userId is null)
    if (
      previousUserId !== undefined &&
      previousUserId !== null &&
      currentUserId === null
    ) {
      // User just signed out - clear all chats from state
      const chatsToDelete = [...chatsRef.current]; // Use ref to get latest chats
      chatsToDelete.forEach((chat) => {
        deleteChat(chat.id);
      });
      // Clear active chat
      setActiveChat(null);
      
      // Also clear localStorage directly to prevent reload issues
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_CHAT_KEY);
      } catch (error) {
        console.error("Failed to clear localStorage on sign out:", error);
      }
    }

    // Update the ref for next comparison
    previousUserIdRef.current = currentUserId;
  }, [userId, isLoaded, deleteChat, setActiveChat]); // Stable functions can be in deps

  return <UserButton />;
}

