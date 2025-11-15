#!/usr/bin/env node
/**
 * Script to clear all op15-related localStorage keys
 * Run this in browser console or use as reference
 */

const OP15_STORAGE_KEYS = [
  'op15-chats',
  'op15-active-chat-id',
  'op15-local-env-enabled',
  'op15-agent-installed',
  'localEnvSelectedDir',
  'localEnvUserId',
];

console.log('🧹 Clearing op15 localStorage keys...');

// This script is meant to be run in browser console
// Copy and paste into browser console:

const clearOp15Storage = () => {
  const keysToRemove = [];
  
  // Add known keys
  OP15_STORAGE_KEYS.forEach(key => {
    if (localStorage.getItem(key)) {
      keysToRemove.push(key);
    }
  });
  
  // Find all keys starting with op15- or localEnv
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('op15-') || key.startsWith('localEnv'))) {
      if (!keysToRemove.includes(key)) {
        keysToRemove.push(key);
      }
    }
  }
  
  // Remove all keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`  ✅ Removed: ${key}`);
  });
  
  console.log(`\n✅ Cleared ${keysToRemove.length} localStorage keys`);
  console.log('🔄 Reloading page...');
  
  // Reload after a short delay
  setTimeout(() => {
    window.location.reload();
  }, 500);
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.clearOp15Storage = clearOp15Storage;
  console.log('✅ clearOp15Storage() function available');
  console.log('   Run: clearOp15Storage()');
} else {
  console.log('📋 Browser Console Script:');
  console.log('   Copy and paste this into your browser console:');
  console.log('');
  console.log(clearOp15Storage.toString());
  console.log('');
  console.log('clearOp15Storage();');
}

