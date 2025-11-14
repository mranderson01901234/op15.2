#!/usr/bin/env node
/**
 * Local Agent - Node.js agent that connects to cloud server via WebSocket
 * Provides full filesystem access without browser restrictions
 */

import WebSocket from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BridgeRequest {
  id: string;
  operation: 'fs.list' | 'fs.read' | 'fs.write' | 'fs.delete' | 'fs.move' | 'exec.run';
  path?: string;
  content?: string;
  command?: string;
  source?: string;
  destination?: string;
  depth?: number;
  encoding?: BufferEncoding;
  recursive?: boolean;
  createDestDirs?: boolean;
  createDirs?: boolean;
  cwd?: string;
  timeoutMs?: number;
  [key: string]: unknown;
}

interface BridgeResponse {
  id: string;
  data?: unknown;
  error?: string;
}

class LocalAgent {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private userId: string;
  private authToken?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;

  constructor(serverUrl: string, userId: string, authToken?: string) {
    this.serverUrl = serverUrl;
    this.userId = userId;
    this.authToken = authToken;
  }

  /**
   * Index main directories in user's home directory
   * Caches common directories like Desktop, Documents, Downloads, etc.
   * 
   * Options:
   * - shallow: Only index top-level directories (fast, low memory)
   * - deep: Recursively index all subdirectories (slow, high memory, comprehensive)
   */
  private async indexMainDirectories(
    homeDir: string,
    options: { maxDepth?: number; recursive?: boolean } = {}
  ): Promise<{
    directories: Array<{ name: string; path: string }>;
    indexedPaths: string[];
  }> {
    const mainDirs: Array<{ name: string; path: string }> = [];
    const indexedPaths: string[] = [];
    const maxDepth = options.maxDepth ?? 2; // Default: 2 levels deep
    const recursive = options.recursive ?? false; // Default: shallow indexing
    
    // Common directory names to prioritize
    const commonDirs = [
      'Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music',
      'Projects', 'Code', 'Development', 'Workspace', 'Work',
      'Dropbox', 'OneDrive', 'Google Drive',
    ];
    
    // Recursive walk function
    const walk = async (dirPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > maxDepth) return;
      
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dirPath, entry.name);
            indexedPaths.push(fullPath);
            
            // If recursive and not at max depth, continue walking
            if (recursive && currentDepth < maxDepth) {
              await walk(fullPath, currentDepth + 1);
            }
          } else {
            // Index files too if recursive
            if (recursive) {
              indexedPaths.push(path.join(dirPath, entry.name));
            }
          }
        }
      } catch (err) {
        // Skip directories we can't access
      }
    };
    
    try {
      // List all directories in home directory
      const entries = await fs.readdir(homeDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(homeDir, entry.name);
          const dirName = entry.name;
          
          // Add all directories
          mainDirs.push({ name: dirName, path: dirPath });
          indexedPaths.push(dirPath);
          
          // If it's a common directory or recursive mode, index deeper
          if (commonDirs.includes(dirName) || recursive) {
            await walk(dirPath, 1); // Start at depth 1 (already indexed the directory itself)
          } else {
            // For non-common directories, just index immediate contents (depth 1)
            try {
              const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
              for (const subEntry of subEntries) {
                const subPath = path.join(dirPath, subEntry.name);
                indexedPaths.push(subPath);
              }
            } catch (err) {
              // Skip if we can't read subdirectory
            }
          }
        }
      }
      
      console.log(`📁 Indexed ${mainDirs.length} main directories and ${indexedPaths.length} paths (depth: ${maxDepth}, recursive: ${recursive})`);
    } catch (error) {
      console.error('Failed to index main directories:', error);
    }
    
    return { directories: mainDirs, indexedPaths };
  }

  async connect(): Promise<void> {
    const wsUrl = this.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    const fullWsUrl = `${wsUrl}/api/bridge?userId=${this.userId}&type=agent${this.authToken ? `&token=${this.authToken}` : ''}`;
    
    console.log(`Connecting to ${fullWsUrl}...`);
    
    this.ws = new WebSocket(fullWsUrl);
    const ws = this.ws; // Store reference for TypeScript

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      ws.on('open', async () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('✅ Connected to cloud server');
        
        try {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '/home/user';
          
          // Index main directories on first load
          // Using shallow indexing (depth 2) for fast connection
          // Full recursive indexing would be too slow and memory-intensive
          console.log('📁 Indexing filesystem (shallow scan)...');
          const indexResult = await this.indexMainDirectories(homeDir, {
            maxDepth: 2, // Index 2 levels deep (home dir + immediate subdirs)
            recursive: false, // Only index common directories deeper
          });
          
          // Send agent metadata including home directory and filesystem index
          ws.send(JSON.stringify({
            type: 'agent-metadata',
            userId: this.userId,
            homeDirectory: homeDir,
            platform: process.platform,
            filesystemIndex: {
              mainDirectories: indexResult.directories,
              indexedPaths: indexResult.indexedPaths,
              indexedAt: new Date().toISOString(),
            },
          }));
          
          console.log(`✅ Filesystem indexed: ${indexResult.directories.length} directories, ${indexResult.indexedPaths.length} paths`);
        } catch (error) {
          console.error('Failed to send agent metadata:', error);
        }
        
        // Set up ping to keep connection alive
        this.pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (error) {
              console.error('Failed to send ping', error);
            }
          }
        }, 30000); // Ping every 30 seconds
        
        resolve();
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle connection confirmation
          if (message.type === 'connected') {
            console.log('Connection confirmed by server', { userId: message.userId });
            return;
          }

          // Handle pong (keepalive)
          if (message.type === 'pong') {
            return;
          }

          // Handle regular requests from server
          const request: BridgeRequest = message;
          if (request.operation) {
            await this.handleRequest(request);
          }
        } catch (error) {
          console.error('Failed to handle message:', error);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        this.isConnected = false;
        reject(error);
      });

      ws.on('close', (code, reason) => {
        this.isConnected = false;
        
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        console.log('Disconnected from server', { code, reason: reason.toString() });
        
        // Attempt reconnection if not a clean close
        if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * this.reconnectAttempts, 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => {
            this.connect().catch(err => {
              console.error('Reconnection failed:', err);
            });
          }, delay);
        }
      });
    });
  }

  private async handleRequest(request: BridgeRequest): Promise<void> {
    try {
      let data: unknown;
      let error: string | undefined;

      try {
        switch (request.operation) {
          case 'fs.list':
            data = await this.listDirectory(request.path || '.', request.depth || 0);
            break;

          case 'fs.read':
            data = { content: await this.readFile(request.path!, request.encoding || 'utf8') };
            break;

          case 'fs.write':
            await this.writeFile(request.path!, request.content || '', request.createDirs ?? true, request.encoding || 'utf8');
            data = { success: true };
            break;

          case 'fs.delete':
            await this.deleteFile(request.path!, request.recursive ?? false);
            data = { success: true };
            break;

          case 'fs.move':
            await this.moveFile(request.source!, request.destination!, request.createDestDirs ?? true);
            data = { success: true };
            break;

          case 'exec.run':
            data = await this.executeCommand(request.command!, request.cwd, request.timeoutMs);
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

  private async listDirectory(dirPath: string, depth: number = 0): Promise<Array<{ name: string; kind: string; path: string; size?: number; mtime?: string }>> {
    const entries: Array<{ name: string; kind: string; path: string; size?: number; mtime?: string }> = [];

    const readDir = async (currentPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) return;

      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);
        
        try {
          const stats = await fs.stat(fullPath);

          entries.push({
            name: item.name,
            path: fullPath,
            kind: item.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            mtime: stats.mtime.toISOString(),
          });

          if (item.isDirectory() && currentDepth < depth) {
            await readDir(fullPath, currentDepth + 1);
          }
        } catch (statError) {
          // Skip files/directories we can't access
          continue;
        }
      }
    };

    await readDir(dirPath, 0);
    return entries;
  }

  private async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return await fs.readFile(filePath, encoding);
  }

  private async writeFile(filePath: string, content: string, createDirs: boolean = true, encoding: BufferEncoding = 'utf8'): Promise<void> {
    if (createDirs) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, content, encoding);
  }

  private async deleteFile(filePath: string, recursive: boolean = false): Promise<void> {
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      if (recursive) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.rmdir(filePath);
      }
    } else {
      await fs.unlink(filePath);
    }
  }

  private async moveFile(source: string, destination: string, createDestDirs: boolean = true): Promise<void> {
    if (createDestDirs) {
      const destDir = path.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });
    }
    await fs.rename(source, destination);
  }

  private async executeCommand(command: string, cwd?: string, timeoutMs?: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const options: { cwd?: string; timeout?: number } = {};
    if (cwd) options.cwd = cwd;
    if (timeoutMs) options.timeout = timeoutMs;

    try {
      const { stdout, stderr } = await execAsync(command, options);
      return { exitCode: 0, stdout, stderr };
    } catch (error: any) {
      return {
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Agent disconnected');
      this.ws = null;
    }
    this.isConnected = false;
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: local-agent <server-url> <user-id> [auth-token]');
    console.error('Example: local-agent https://your-app.up.railway.app user_123abc');
    process.exit(1);
  }

  const [serverUrl, userId, authToken] = args;
  
  console.log('Local Agent Starting...');
  console.log(`Server: ${serverUrl}`);
  console.log(`User ID: ${userId}`);
  
  const agent = new LocalAgent(serverUrl, userId, authToken);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    agent.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    agent.disconnect();
    process.exit(0);
  });

  try {
    await agent.connect();
    console.log('Agent is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { LocalAgent };

