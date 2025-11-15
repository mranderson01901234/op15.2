"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  images?: Array<{
    thumbnail: { src: string; original: string | null } | null;
    url: string;
    title: string;
  }>;
  videos?: Array<{
    thumbnail: { src: string; original: string | null } | null;
    url: string;
    title: string;
    duration: string | null;
    age: string | null;
  }>;
  formattedSearch?: any;
  userQuery?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface ChatContextType {
  chats: Chat[];
  activeChatId: string | null;
  isHydrated: boolean;
  createChat: () => string;
  deleteChat: (id: string) => void;
  setActiveChat: (id: string | null) => void;
  updateChatMessages: (id: string, messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => void;
  updateChatTitle: (id: string, title: string) => void;
  getActiveChat: () => Chat | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const STORAGE_KEY = "op15-chats";
const ACTIVE_CHAT_KEY = "op15-active-chat-id";

export function ChatProvider({ children }: { children: ReactNode }) {
  // Initialize with empty state to prevent hydration mismatches
  // Load from localStorage only after mount (client-side)
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const { userId, isLoaded: authLoaded } = useAuth();

  // Load chats and activeChatId from localStorage after mount (client-side only)
  // Only load if user is authenticated
  useEffect(() => {
    if (!authLoaded) return; // Wait for auth to load
    
      // If user is not authenticated, clear any existing chats and don't load from localStorage
      if (!userId) {
        setChats([]);
        setActiveChatId(null);
        // Clear localStorage to prevent stale data
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(ACTIVE_CHAT_KEY);
          // Also clear any other op15 keys that might be user-specific
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
          console.error("Failed to clear localStorage:", error);
        }
        setIsHydrated(true);
        return;
      }

    // User is authenticated - load chats from localStorage
    try {
      const storedChats = localStorage.getItem(STORAGE_KEY);
      if (storedChats) {
        const parsedChats = JSON.parse(storedChats);
        setChats(parsedChats);
      }

      const storedActiveChatId = localStorage.getItem(ACTIVE_CHAT_KEY);
      if (storedActiveChatId) {
        setActiveChatId(storedActiveChatId);
      }
    } catch (error) {
      console.error("Failed to load chats from localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, [authLoaded, userId]); // Re-run when auth state changes

  // Save chats to localStorage whenever they change (but only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (error) {
      console.error("Failed to save chats to localStorage:", error);
    }
  }, [chats, isHydrated]);

  // Save active chat ID to localStorage whenever it changes (but only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    try {
      if (activeChatId) {
        localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
      } else {
        localStorage.removeItem(ACTIVE_CHAT_KEY);
      }
    } catch (error) {
      console.error("Failed to save active chat ID to localStorage:", error);
    }
  }, [activeChatId, isHydrated]);

  // Validate activeChatId exists in chats array (only when chats change, not when activeChatId changes)
  // Only validate after hydration to prevent issues
  useEffect(() => {
    if (!isHydrated) return;
    if (activeChatId) {
      if (chats.length === 0) {
        // No chats but activeChatId is set, clear it
        setActiveChatId(null);
      } else {
        const chatExists = chats.some((chat) => chat.id === activeChatId);
        if (!chatExists) {
          // Active chat doesn't exist, switch to first chat
          setActiveChatId(chats[0].id);
        }
      }
    }
  }, [chats, isHydrated]); // Only depend on chats and hydration status

  const createChat = useCallback(() => {
    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    // Dispatch event to notify that a new chat was created
    // This allows components to react immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('newChatCreated'));
    }
    return newChat.id;
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const filtered = prev.filter((chat) => chat.id !== id);
      // If we deleted the active chat, switch to the first remaining chat or null
      if (id === activeChatId) {
        setActiveChatId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  }, [activeChatId]);

  const setActiveChat = useCallback((id: string | null) => {
    setActiveChatId(id);
  }, []);

  const updateChatMessages = useCallback((id: string, messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => {
    setChats((prev) => {
      const chat = prev.find((c) => c.id === id);
      if (!chat) {
        // If chat doesn't exist, create it
        const newChat: Chat = {
          id,
          title: "New Chat",
          messages: typeof messagesOrUpdater === 'function' ? messagesOrUpdater([]) : messagesOrUpdater,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return [newChat, ...prev];
      }

      const newMessages = typeof messagesOrUpdater === 'function' 
        ? messagesOrUpdater(chat.messages)
        : messagesOrUpdater;

      const updated = prev.map((c) =>
        c.id === id
          ? { ...c, messages: newMessages, updatedAt: Date.now() }
          : c
      );
      
      // Auto-generate title from first user message if title is still "New Chat"
      const updatedChat = updated.find((c) => c.id === id);
      if (updatedChat && updatedChat.title === "New Chat" && newMessages.length > 0) {
        const firstUserMessage = newMessages.find((m) => m.role === "user");
        if (firstUserMessage) {
          const title = firstUserMessage.content.slice(0, 50).trim();
          if (title) {
            return updated.map((c) =>
              c.id === id ? { ...c, title, updatedAt: Date.now() } : c
            );
          }
        }
      }
      
      return updated;
    });
  }, []);

  const updateChatTitle = useCallback((id: string, title: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === id ? { ...chat, title, updatedAt: Date.now() } : chat
      )
    );
  }, []);

  const getActiveChat = useCallback(() => {
    return chats.find((chat) => chat.id === activeChatId) || null;
  }, [chats, activeChatId]);

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChatId,
        isHydrated,
        createChat,
        deleteChat,
        setActiveChat,
        updateChatMessages,
        updateChatTitle,
        getActiveChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

