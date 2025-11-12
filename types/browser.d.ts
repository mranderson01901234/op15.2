/**
 * Browser API type definitions
 * Extends standard DOM types with File System Access API
 */

interface Window {
  showDirectoryPicker?: (options?: { 
    mode?: 'read' | 'readwrite';
    multiple?: boolean;
  }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

