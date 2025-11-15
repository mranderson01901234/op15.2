/**
 * Comprehensive localStorage cleanup utility
 * Clears all op15-related localStorage keys
 */

const OP15_STORAGE_KEYS = [
  'op15-chats',
  'op15-active-chat-id',
  'op15-local-env-enabled',
  'op15-agent-installed',
  'localEnvSelectedDir',
  'localEnvUserId',
] as const;

/**
 * Clears all op15-related localStorage keys
 */
export function clearAllOp15Storage(): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Clear all known keys
    OP15_STORAGE_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Also clear any keys that start with 'op15-' or 'localEnv'
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
        allKeys.push(key);
      }
    }
    allKeys.forEach(key => localStorage.removeItem(key));
    
    // Dispatch event to notify components
    window.dispatchEvent(new CustomEvent('op15StorageCleared'));
    
    console.log('✅ Cleared all op15 localStorage keys');
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
}

/**
 * Clears localStorage and reloads the page
 */
export function clearStorageAndReload(): void {
  clearAllOp15Storage();
  window.location.reload();
}

