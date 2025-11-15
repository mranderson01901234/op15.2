"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "op15-local-env-enabled";

/**
 * Hook to manage local environment enabled/disabled state
 * Defaults to enabled (true) for backward compatibility
 */
export function useLocalEnvEnabled() {
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load from localStorage on mount
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setIsEnabled(stored === "true");
    } else {
      // Default to enabled if not set
      setIsEnabled(true);
    }
    setIsLoaded(true);
  }, []);

  const setEnabled = (enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    
    // If disabling, disconnect any active connections
    if (!enabled) {
      // Dispatch event to notify components to disconnect
      window.dispatchEvent(new CustomEvent("localEnvDisabled"));
      
      // Also try to disconnect any bridge instance stored in window
      if (typeof window !== "undefined" && (window as any).localEnvBridge) {
        try {
          (window as any).localEnvBridge.disconnect();
          delete (window as any).localEnvBridge;
        } catch (error) {
          console.warn("Failed to disconnect bridge:", error);
        }
      }
    }
  };

  return {
    isEnabled,
    isLoaded,
    setEnabled,
  };
}

