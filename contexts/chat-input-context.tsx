"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface ChatInputContextType {
  insertText: (text: string) => void;
  sendMessage: (text: string) => void;
  setInsertTextHandler: (handler: (text: string) => void) => void;
  setSendMessageHandler: (handler: (text: string) => void) => void;
}

const ChatInputContext = createContext<ChatInputContextType | undefined>(undefined);

export function ChatInputProvider({ children }: { children: ReactNode }) {
  const [insertHandler, setInsertHandler] = useState<((text: string) => void) | null>(null);
  const [sendMessageHandler, setSendMessageHandlerState] = useState<((text: string) => void) | null>(null);

  const insertText = useCallback((text: string) => {
    if (insertHandler) {
      insertHandler(text);
    }
  }, [insertHandler]);

  const sendMessage = useCallback((text: string) => {
    if (sendMessageHandler) {
      sendMessageHandler(text);
    }
  }, [sendMessageHandler]);

  const setInsertTextHandler = useCallback((handler: (text: string) => void) => {
    setInsertHandler(() => handler);
  }, []);

  const setSendMessageHandler = useCallback((handler: (text: string) => void) => {
    setSendMessageHandlerState(() => handler);
  }, []);

  return (
    <ChatInputContext.Provider value={{ insertText, sendMessage, setInsertTextHandler, setSendMessageHandler }}>
      {children}
    </ChatInputContext.Provider>
  );
}

export function useChatInput() {
  const context = useContext(ChatInputContext);
  if (!context) {
    throw new Error("useChatInput must be used within a ChatInputProvider");
  }
  return context;
}

