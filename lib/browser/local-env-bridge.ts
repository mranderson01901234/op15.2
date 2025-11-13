/**
 * Browser-side File System Bridge
 * Uses File System Access API to bridge cloud server and local filesystem
 */

export interface BridgeRequest {
  id: string;
  operation: 'fs.list' | 'fs.read' | 'fs.write' | 'fs.delete' | 'fs.move' | 'exec.run';
  path?: string;
  content?: string;
  command?: string;
  source?: string;
  destination?: string;
  [key: string]: unknown;
}

export interface BridgeResponse {
  id: string;
  data?: unknown;
  error?: string;
}

export class LocalEnvBridge {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private userId: string;
  private isConnected = false;
  private pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(serverUrl: string, userId: string) {
    // Validate serverUrl is not undefined or empty
    if (!serverUrl || serverUrl === 'undefined' || serverUrl.includes('undefined')) {
      throw new Error(`Invalid serverUrl provided to LocalEnvBridge: ${serverUrl}. The API should return a valid server URL.`);
    }
    this.serverUrl = serverUrl;
    this.userId = userId;
  }

  /**
   * Check if File System Access API is available
   */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 
           typeof (window as any).showDirectoryPicker === 'function';
  }

  /**
   * Get browser compatibility message
   */
  static getCompatibilityMessage(): string {
    if (typeof window === 'undefined') {
      return 'File System Access API is only available in browser environments';
    }

    if (!('showDirectoryPicker' in window)) {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('firefox')) {
        return 'Firefox does not support File System Access API. Please use Chrome, Edge, or Opera.';
      }
      if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        return 'Safari does not support File System Access API. Please use Chrome, Edge, or Opera.';
      }
      return 'Your browser does not support File System Access API. Please use Chrome 86+, Edge 86+, or Opera 72+.';
    }

    // Check if we're on HTTPS or localhost
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'File System Access API requires HTTPS or localhost.';
    }

    return '';
  }

  /**
   * Connect to cloud server and request file system access
   * @param unrestrictedMode - If true, user should select a high-level directory (e.g., home directory) for broader access
   */
  async connect(unrestrictedMode: boolean = false): Promise<void> {
    try {
      // Check if File System Access API is supported
      if (!LocalEnvBridge.isSupported()) {
        const message = LocalEnvBridge.getCompatibilityMessage();
        throw new Error(message || 'File System Access API is not supported in this browser');
      }

      // 1. Request file system access (one-click authorization)
      // Note: File System Access API restricts access to the selected directory and its subdirectories.
      // For "unrestricted" access, users should select a high-level directory (e.g., home directory).
      const showDirectoryPicker = (window as any).showDirectoryPicker as (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      
      if (unrestrictedMode) {
        console.log('Unrestricted mode enabled: Please select a high-level directory (e.g., your home directory) to access files across multiple folders.');
      }
      
      try {
        this.dirHandle = await showDirectoryPicker({
          mode: 'readwrite',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Check if it's a system directory restriction
        if (errorMessage.includes('system') || errorMessage.includes('restricted') || errorMessage.includes('denied')) {
          throw new Error(
            `Cannot select this directory: The browser's File System Access API restricts access to system directories ` +
            `(like /, /root, /etc, /sys, /proc on Linux, or C:\\Windows on Windows) for security reasons. ` +
            `Please select a non-system directory instead, such as /home or a subdirectory within your home directory.`
          );
        }
        throw error;
      }

      // 2. Connect WebSocket to cloud server bridge endpoint
      await this.connectWebSocket();

      // 3. Send workspace metadata to cloud
      await this.syncWorkspaceMetadata();
    } catch (error) {
      console.error('Failed to connect local environment bridge:', error);
      throw error;
    }
  }

  /**
   * Check if server URL is on Vercel (which doesn't support WebSocket)
   */
  private isVercelDeployment(): boolean {
    try {
      const url = new URL(this.serverUrl);
      return url.hostname.includes('vercel.app') || url.hostname.includes('vercel.com');
    } catch {
      return false;
    }
  }

  /**
   * Connect WebSocket with automatic reconnection
   */
  private async connectWebSocket(): Promise<void> {
    // Validate serverUrl again (defensive check)
    if (!this.serverUrl || this.serverUrl === 'undefined' || this.serverUrl.includes('undefined')) {
      throw new Error(`Cannot connect WebSocket: serverUrl is invalid (${this.serverUrl}). Please ensure NEXT_PUBLIC_APP_URL or RAILWAY_PUBLIC_DOMAIN is set correctly.`);
    }

    // Check if we're on Vercel (which doesn't support WebSocket)
    if (this.isVercelDeployment()) {
      const error = new Error('WebSocket connections are not supported on Vercel. The local environment bridge requires a persistent WebSocket connection, which is not available on Vercel serverless functions. Please use a custom server deployment or a third-party WebSocket service.');
      (error as any).isVercelError = true;
      throw error;
    }

    const wsUrl = this.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    const fullWsUrl = `${wsUrl}/api/bridge?userId=${this.userId}`;
    
    console.log('Attempting WebSocket connection', { url: fullWsUrl, userId: this.userId });
    
    this.ws = new WebSocket(fullWsUrl);

    return new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          // Check if this might be a Vercel deployment issue
          const isVercel = this.isVercelDeployment();
          const errorMessage = isVercel
            ? 'WebSocket connection failed. Vercel serverless functions do not support WebSocket connections. Please use a custom server deployment.'
            : `WebSocket connection timeout after 10 seconds. URL: ${fullWsUrl}`;
          reject(new Error(errorMessage));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        console.log('✅ Local environment bridge WebSocket connected', { url: fullWsUrl });
        
        // Set up client-side ping to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              // Send ping as JSON message (server will respond with pong)
              this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (error) {
              console.error('Failed to send ping', error);
            }
          }
        }, 30000); // Ping every 30 seconds
        
        resolve();
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle connection confirmation
          if (message.type === 'connected') {
            console.log('Bridge connection confirmed', { userId: message.userId });
            // Don't return - keep connection open
            return;
          }

          // Handle pong (keepalive)
          if (message.type === 'pong') {
            console.debug('Received pong from server');
            return;
          }

          // Handle regular requests from server
          const request: BridgeRequest = message;
          if (request.operation) {
            await this.handleRequest(request);
          }
        } catch (error) {
          console.error('Failed to handle bridge message:', error);
        }
      };

      this.ws.onerror = (error) => {
        // Don't log errors for Vercel deployments - they're expected
        const isVercel = this.isVercelDeployment();
        if (!isVercel) {
          console.error('❌ Bridge WebSocket error:', {
            error,
            url: fullWsUrl,
            readyState: this.ws?.readyState,
            userId: this.userId,
          });
        }
        this.isConnected = false;
        if (timeout) {
          clearTimeout(timeout);
          const errorMessage = isVercel
            ? 'WebSocket connections are not supported on Vercel serverless functions. Please use a custom server deployment.'
            : `WebSocket connection failed: ${error}`;
          reject(new Error(errorMessage));
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        
        // Clear ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        const isVercel = this.isVercelDeployment();
        // Only log disconnection if not Vercel (expected failures)
        if (!isVercel) {
          console.log('Local environment bridge disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean,
            url: fullWsUrl,
            reconnectAttempts: this.reconnectAttempts,
          });
        }
        
        // Don't attempt reconnection on Vercel or if it was a clean close
        if (isVercel || event.code === 1000) {
          return;
        }
        
        // Attempt reconnection if not a clean close and we haven't exceeded max attempts
        if (this.dirHandle && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * this.reconnectAttempts, 30000); // Exponential backoff, max 30s
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => {
            this.connectWebSocket().catch(err => {
              console.error('Reconnection failed:', err);
            });
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached. Please reconnect manually.');
        }
      };
    });
  }

  /**
   * Disconnect from cloud server
   */
  disconnect(): void {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      // Close with clean code
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
    this.dirHandle = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if bridge is connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming request from cloud server
   */
  private async handleRequest(request: BridgeRequest): Promise<void> {
    try {
      let data: unknown;
      let error: string | undefined;

      try {
        switch (request.operation) {
          case 'fs.list':
            data = await this.listDirectory(request.path || '.');
            break;

          case 'fs.read':
            data = { content: await this.readFile(request.path!) };
            break;

          case 'fs.write':
            await this.writeFile(request.path!, request.content || '');
            data = { success: true };
            break;

          case 'fs.delete':
            await this.deleteFile(request.path!);
            data = { success: true };
            break;

          case 'fs.move':
            await this.moveFile(request.source!, request.destination!);
            data = { success: true };
            break;

          case 'exec.run':
            // For exec.run, sync workspace to cloud
            await this.syncWorkspaceForExec(request);
            data = { success: true, message: 'Workspace synced for execution' };
            break;

          default:
            error = `Unknown operation: ${request.operation}`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      this.sendResponse(request.id, data, error);
    } catch (err) {
      this.sendResponse(request.id, undefined, err instanceof Error ? err.message : 'Unknown error');
    }
  }

  /**
   * Send response back to cloud server
   */
  private sendResponse(requestId: string, data?: unknown, error?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Cannot send response: WebSocket not connected');
      return;
    }

    const response: BridgeResponse = {
      id: requestId,
      ...(error ? { error } : { data }),
    };

    this.ws.send(JSON.stringify(response));
  }

  /**
   * Sync workspace metadata to cloud server
   */
  private async syncWorkspaceMetadata(): Promise<void> {
    if (!this.dirHandle) return;

    try {
      const metadata = {
        rootPath: this.dirHandle.name,
        timestamp: Date.now(),
      };

      // Send metadata to cloud server
      await fetch(`${this.serverUrl}/api/workspace/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to sync workspace metadata:', error);
    }
  }

  /**
   * Sync workspace files for exec.run
   */
  private async syncWorkspaceForExec(request: BridgeRequest): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('File system access not granted');
    }

    const workspaceFiles = await this.collectWorkspaceFiles();

    // Send files to cloud server
    const response = await fetch(`${this.serverUrl}/api/workspace/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        files: workspaceFiles,
        command: request.command,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync workspace: ${response.statusText}`);
    }
  }

  /**
   * Collect all files in workspace recursively
   */
  private async collectWorkspaceFiles(): Promise<Array<{ path: string; content: string }>> {
    if (!this.dirHandle) {
      return [];
    }

    const files: Array<{ path: string; content: string }> = [];

    const walk = async (
      dir: FileSystemDirectoryHandle,
      basePath: string = ''
    ): Promise<void> => {
      try {
        for await (const [name, handle] of dir.entries()) {
          const path = basePath ? `${basePath}/${name}` : name;

          if (handle.kind === 'file') {
            try {
              const fileHandle = handle as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              // Only sync text files (skip binaries for now)
              if (file.type.startsWith('text/') || file.type === 'application/json') {
                const content = await file.text();
                files.push({ path, content });
              }
            } catch (err) {
              console.warn(`Failed to read file ${path}:`, err);
            }
          } else if (handle.kind === 'directory') {
            // Skip node_modules and .git by default
            if (name !== 'node_modules' && name !== '.git' && !name.startsWith('.')) {
              await walk(handle as FileSystemDirectoryHandle, path);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to walk directory ${basePath}:`, err);
      }
    };

    await walk(this.dirHandle, '');
    return files;
  }

  /**
   * List directory contents
   */
  private async listDirectory(path: string): Promise<Array<{ name: string; kind: string; path: string }>> {
    if (!this.dirHandle) {
      throw new Error('File system access not granted');
    }

    // Handle empty path or current directory
    if (!path || path === '.' || path === '') {
      const entries: Array<{ name: string; kind: string; path: string }> = [];
      for await (const [name, handle] of this.dirHandle.entries()) {
        entries.push({
          name,
          kind: handle.kind,
          path: name,
        });
      }
      return entries;
    }

    const parts = path.split('/').filter(Boolean);
    
    // If path is absolute and matches the root directory name, list root directly
    // e.g., if root is /home and path is /home, parts = ['home'] and dirHandle.name = 'home'
    if (path.startsWith('/') && parts.length === 1 && parts[0] === this.dirHandle.name) {
      const entries: Array<{ name: string; kind: string; path: string }> = [];
      for await (const [name, handle] of this.dirHandle.entries()) {
        entries.push({
          name,
          kind: handle.kind,
          path: name,
        });
      }
      return entries;
    }

    let current = this.dirHandle;

    // Navigate to target directory
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      current = await current.getDirectoryHandle(part);
    }

    const entries: Array<{ name: string; kind: string; path: string }> = [];
    const basePath = parts.length > 0 ? parts.join('/') : '';

    for await (const [name, handle] of current.entries()) {
      entries.push({
        name,
        kind: handle.kind,
        path: basePath ? `${basePath}/${name}` : name,
      });
    }

    return entries;
  }

  /**
   * Read file content
   */
  private async readFile(path: string): Promise<string> {
    if (!this.dirHandle) {
      throw new Error('File system access not granted');
    }

    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error('Invalid file path');
    }

    let current = this.dirHandle;

    // Navigate to parent directory
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    const fileHandle = await current.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  /**
   * Write file content
   */
  private async writeFile(path: string, content: string): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('File system access not granted');
    }

    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error('Invalid file path');
    }

    let current = this.dirHandle;

    // Navigate to parent directory, creating directories as needed
    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part);
      } catch {
        current = await current.getDirectoryHandle(part, { create: true });
      }
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Delete file
   */
  private async deleteFile(path: string): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('File system access not granted');
    }

    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error('Invalid file path');
    }

    let current = this.dirHandle;

    // Navigate to parent directory
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    await current.removeEntry(fileName);
  }

  /**
   * Move/rename file
   */
  private async moveFile(source: string, destination: string): Promise<void> {
    // Read source file
    const content = await this.readFile(source);
    
    // Write to destination
    await this.writeFile(destination, content);
    
    // Delete source
    await this.deleteFile(source);
  }
}

