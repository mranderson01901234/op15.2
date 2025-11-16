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
import http from 'http';
import { URL } from 'url';

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

interface SessionPermissions {
  allowedDirectories: string[];
  allowedOperations: ('read' | 'write' | 'delete' | 'exec')[];
  approvedPlan?: Array<{ id: string; operation: string; args: Record<string, unknown> }>;
  mode: 'safe' | 'balanced' | 'unrestricted';
}

interface ActionLog {
  timestamp: number;
  userId: string;
  operation: string;
  path?: string;
  command?: string;
  result: 'success' | 'error' | 'denied';
  details: Record<string, unknown>;
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
  private sessionPermissions: SessionPermissions | null = null;
  private actionLogs: ActionLog[] = [];
  private httpServer: http.Server | null = null;
  private isShuttingDown = false;

  constructor(serverUrl: string, userId: string, authToken?: string) {
    this.serverUrl = serverUrl;
    this.userId = userId;
    this.authToken = authToken;
    this.startHttpServer();
  }

  /**
   * Start HTTP server for plan approval and kill switch
   */
  private startHttpServer(): void {
    const port = parseInt(process.env.AGENT_HTTP_PORT || '4001', 10);
    
    this.httpServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (url.pathname === '/health' && req.method === 'GET') {
        this.handleHealth(req, res);
      } else if (url.pathname === '/plan/approve' && req.method === 'POST') {
        this.handlePlanApproval(req, res);
      } else if (url.pathname === '/kill' && req.method === 'POST') {
        this.handleKillSwitch(req, res);
      } else if (url.pathname === '/status' && req.method === 'GET') {
        this.handleStatus(req, res);
      } else if (url.pathname === '/logs' && req.method === 'GET') {
        this.handleLogs(req, res);
      } else if (url.pathname === '/execute' && req.method === 'POST') {
        this.handleExecute(req, res);
      } else if (url.pathname === '/fs/list' && req.method === 'POST') {
        this.handleFsList(req, res);
      } else if (url.pathname === '/fs/read' && req.method === 'POST') {
        this.handleFsRead(req, res);
      } else if (url.pathname === '/fs/write' && req.method === 'POST') {
        this.handleFsWrite(req, res);
      } else if (url.pathname === '/fs/delete' && req.method === 'POST') {
        this.handleFsDelete(req, res);
      } else if (url.pathname === '/fs/move' && req.method === 'POST') {
        this.handleFsMove(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
    
    this.httpServer.listen(port, '127.0.0.1', () => {
      console.log(`🔒 HTTP API listening on http://127.0.0.1:${port}`);
      console.log(`   Endpoints: /health, /plan/approve, /kill, /status, /logs, /execute, /fs/*`);
      console.log(`   ⚠️  Note: HTTP API works even if WebSocket closes!`);
    });
    
    this.httpServer.on('error', (err) => {
      console.error(`❌ HTTP server error:`, err);
    });
  }

  /**
   * Handle health check request (fast, lightweight)
   */
  private handleHealth(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  }

  /**
   * Handle plan approval via HTTP
   */
  private handlePlanApproval(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const permissions: SessionPermissions = {
          allowedDirectories: data.allowedDirectories || [],
          allowedOperations: data.allowedOperations || [],
          approvedPlan: data.approvedPlan || [],
          mode: data.mode || 'balanced',
        };
        
        this.sessionPermissions = permissions;
        this.logAction('plan.approved', { mode: permissions.mode, planSteps: permissions.approvedPlan?.length || 0 });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Plan approved' }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', message: error instanceof Error ? error.message : 'Unknown error' }));
      }
    });
  }

  /**
   * Handle kill switch via HTTP
   */
  private handleKillSwitch(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.logAction('kill.switch', {});
    this.isShuttingDown = true;
    
    // Disconnect WebSocket
    this.disconnect();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Agent shutting down' }));
    
    // Exit process after short delay
    setTimeout(() => {
      console.log('🛑 Kill switch activated - exiting');
      process.exit(0);
    }, 1000);
  }

  /**
   * Handle status request
   */
  private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const status = {
      connected: this.isConnected,
      userId: this.userId,
      hasPermissions: this.sessionPermissions !== null,
      mode: this.sessionPermissions?.mode || null,
      allowedDirectories: this.sessionPermissions?.allowedDirectories || [],
      allowedOperations: this.sessionPermissions?.allowedOperations || [],
      isShuttingDown: this.isShuttingDown,
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  /**
   * Handle logs request
   */
  private handleLogs(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    
    const logs = this.actionLogs.slice(-limit);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs, total: this.actionLogs.length }));
  }

  /**
   * Handle HTTP request helper - reads body and calls handler
   */
  private async readRequestBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Handle execute operation via HTTP
   */
  private async handleExecute(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'exec.run',
        command: body.command as string,
        cwd: body.cwd as string | undefined,
        timeoutMs: body.timeoutMs as number | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      const result = await this.executeCommand(request.command!, request.cwd, request.timeoutMs);
      this.logAction('exec.run', {
        command: request.command,
        cwd: request.cwd,
        exitCode: result.exitCode,
        result: result.exitCode === 0 ? 'success' : 'error',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Resolve a path, expanding common directory names to home directory
   * Examples: "Desktop" -> "/home/user/Desktop", "~/Documents" -> "/home/user/Documents"
   */
  private resolvePath(inputPath: string): string {
    if (!inputPath || inputPath === '.') {
      return inputPath;
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '/home/user';
    
    // Common directory names that should be resolved to home directory
    const commonDirs = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'];
    
    // Handle ~ expansion
    if (inputPath.startsWith('~/')) {
      return path.join(homeDir, inputPath.slice(2));
    }
    
    // If path is just a common directory name (no slashes), resolve to home
    if (!inputPath.includes('/') && !inputPath.includes('\\') && commonDirs.includes(inputPath)) {
      return path.join(homeDir, inputPath);
    }
    
    // If path starts with a common directory name followed by /, resolve to home
    for (const dir of commonDirs) {
      if (inputPath === dir || inputPath.startsWith(dir + '/') || inputPath.startsWith(dir + '\\')) {
        return path.join(homeDir, inputPath);
      }
    }
    
    // Otherwise, resolve as normal (handles absolute paths and relative paths)
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(inputPath);
  }

  /**
   * Handle fs.list operation via HTTP
   */
  private async handleFsList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const rawPath = body.path as string;
      const resolvedPath = rawPath ? this.resolvePath(rawPath) : '.';
      
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'fs.list',
        path: resolvedPath,
        depth: body.depth as number | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      const result = await this.listDirectory(resolvedPath, request.depth || 0);
      this.logAction('fs.list', { path: rawPath, resolvedPath, result: 'success', itemCount: Array.isArray(result) ? result.length : 0 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Handle fs.read operation via HTTP
   */
  private async handleFsRead(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const rawPath = body.path as string;
      const resolvedPath = rawPath ? this.resolvePath(rawPath) : '.';
      
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'fs.read',
        path: resolvedPath,
        encoding: body.encoding as BufferEncoding | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      const content = await this.readFile(resolvedPath, request.encoding || 'utf8');
      const result = { content };
      this.logAction('fs.read', { path: rawPath, resolvedPath, result: 'success', size: content.length });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Handle fs.write operation via HTTP
   */
  private async handleFsWrite(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const rawPath = body.path as string;
      const resolvedPath = rawPath ? this.resolvePath(rawPath) : '.';
      
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'fs.write',
        path: resolvedPath,
        content: body.content as string,
        createDirs: body.createDirs as boolean | undefined,
        encoding: body.encoding as BufferEncoding | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      await this.writeFile(resolvedPath, request.content || '', request.createDirs ?? true, request.encoding || 'utf8');
      const result = { success: true };
      this.logAction('fs.write', { path: rawPath, resolvedPath, result: 'success', size: request.content?.length || 0 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Handle fs.delete operation via HTTP
   */
  private async handleFsDelete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const rawPath = body.path as string;
      const resolvedPath = rawPath ? this.resolvePath(rawPath) : '.';
      
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'fs.delete',
        path: resolvedPath,
        recursive: body.recursive as boolean | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      await this.deleteFile(resolvedPath, request.recursive ?? false);
      const result = { success: true };
      this.logAction('fs.delete', { path: rawPath, resolvedPath, recursive: request.recursive, result: 'success' });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Handle fs.move operation via HTTP
   */
  private async handleFsMove(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const rawSource = body.source as string;
      const rawDestination = body.destination as string;
      const resolvedSource = rawSource ? this.resolvePath(rawSource) : '.';
      const resolvedDestination = rawDestination ? this.resolvePath(rawDestination) : '.';
      
      const request: BridgeRequest = {
        id: `http-${Date.now()}`,
        operation: 'fs.move',
        source: resolvedSource,
        destination: resolvedDestination,
        createDestDirs: body.createDestDirs as boolean | undefined,
      };

      const permissionCheck = this.checkPermission(request);
      if (!permissionCheck.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Permission denied: ${permissionCheck.reason}` }));
        return;
      }

      await this.moveFile(resolvedSource, resolvedDestination, request.createDestDirs ?? true);
      const result = { success: true };
      this.logAction('fs.move', { source: rawSource, destination: rawDestination, resolvedSource, resolvedDestination, result: 'success' });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }

  /**
   * Log an action for audit trail
   */
  private logAction(operation: string, details: Record<string, unknown>): void {
    const log: ActionLog = {
      timestamp: Date.now(),
      userId: this.userId,
      operation,
      result: 'success',
      details,
    };
    
    this.actionLogs.push(log);
    
    // Keep only last 1000 logs in memory
    if (this.actionLogs.length > 1000) {
      this.actionLogs = this.actionLogs.slice(-1000);
    }
  }

  /**
   * Check if request is allowed based on session permissions
   */
  private checkPermission(request: BridgeRequest): { allowed: boolean; reason?: string } {
    // If shutting down, deny all requests
    if (this.isShuttingDown) {
      return { allowed: false, reason: 'Agent is shutting down' };
    }
    
    // If no permissions set, deny all requests (except read-only in safe mode)
    if (!this.sessionPermissions) {
      // Allow read-only operations if in safe mode (default)
      if (request.operation === 'fs.list' || request.operation === 'fs.read') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'No session permissions set. Please approve a plan first.' };
    }
    
    const { mode, allowedOperations, allowedDirectories, approvedPlan } = this.sessionPermissions;
    
    // Unrestricted mode: allow everything (still logged)
    if (mode === 'unrestricted') {
      return { allowed: true };
    }
    
    // Safe mode: read-only
    if (mode === 'safe') {
      if (request.operation === 'fs.list' || request.operation === 'fs.read') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Safe mode: only read operations allowed' };
    }
    
    // Balanced mode: check operations and directories
    if (mode === 'balanced') {
      // Check operation type
      let operationType: 'read' | 'write' | 'delete' | 'exec';
      if (request.operation === 'fs.list' || request.operation === 'fs.read') {
        operationType = 'read';
      } else if (request.operation === 'fs.write') {
        operationType = 'write';
      } else if (request.operation === 'fs.delete' || request.operation === 'fs.move') {
        operationType = 'delete';
      } else if (request.operation === 'exec.run') {
        operationType = 'exec';
      } else {
        return { allowed: false, reason: 'Unknown operation type' };
      }
      
      if (!allowedOperations.includes(operationType)) {
        return { allowed: false, reason: `Operation ${operationType} not allowed in current session` };
      }
      
      // Check directory whitelist
      const pathsToCheck = [
        request.path,
        request.source,
        request.destination,
        request.cwd,
      ].filter(Boolean) as string[];
      
      if (pathsToCheck.length > 0) {
        const allAllowed = pathsToCheck.every(p => {
          return allowedDirectories.some(dir => p.startsWith(dir));
        });
        
        if (!allAllowed) {
          return { allowed: false, reason: `Path not in allowed directories: ${pathsToCheck.join(', ')}` };
        }
      }
      
      return { allowed: true };
    }
    
    return { allowed: false, reason: 'Unknown mode' };
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
          
          // TEMPORARILY DISABLED: Index filesystem on connect
          // Testing if large payload causes disconnect
          console.log('📁 Skipping filesystem index (temporarily disabled for testing)');
          
          // Send agent metadata WITHOUT filesystem index
          const httpPort = parseInt(process.env.AGENT_HTTP_PORT || '4001', 10);
          ws.send(JSON.stringify({
            type: 'agent-metadata',
            userId: this.userId,
            homeDirectory: homeDir,
            platform: process.platform,
            httpPort: httpPort, // Include HTTP API port
            // filesystemIndex: null,  // Disabled for testing
          }));
          
          console.log(`✅ Metadata sent (without filesystem index)`);
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

          // Handle metadata acknowledgment
          if (message.type === 'metadata-ack') {
            console.log('Metadata acknowledged by server');
            return;
          }

          // Handle plan approval via WebSocket (alternative to HTTP)
          if (message.type === 'plan-approve') {
            const permissions: SessionPermissions = {
              allowedDirectories: message.allowedDirectories || [],
              allowedOperations: message.allowedOperations || [],
              approvedPlan: message.approvedPlan || [],
              mode: message.mode || 'balanced',
            };
            
            this.sessionPermissions = permissions;
            this.logAction('plan.approved', { mode: permissions.mode, planSteps: permissions.approvedPlan?.length || 0 });
            
            // Send confirmation
            ws.send(JSON.stringify({
              type: 'plan-approved',
              success: true,
            }));
            
            console.log(`✅ Plan approved: mode=${permissions.mode}, directories=${permissions.allowedDirectories.length}, operations=${permissions.allowedOperations.join(',')}`);
            return;
          }

          // Handle regular requests from server
          const request: BridgeRequest = message;
          if (request.operation) {
            await this.handleRequest(request);
          } else {
            console.log('Received message without operation:', message.type || 'unknown');
          }
        } catch (error) {
          console.error('Failed to handle message:', error);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ WebSocket error event:', error);
        console.error('Error details:', { message: error.message, code: (error as any).code, errno: (error as any).errno });
        this.isConnected = false;
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log('❌ WebSocket close event received', { code, reason: reason.toString(), readyState: ws.readyState });
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
    // Check permissions BEFORE executing
    const permissionCheck = this.checkPermission(request);
    if (!permissionCheck.allowed) {
      this.logAction(request.operation, {
        result: 'denied',
        reason: permissionCheck.reason,
        path: request.path,
        command: request.command,
      });
      this.sendResponse(request.id, undefined, `Permission denied: ${permissionCheck.reason}`);
      return;
    }
    
    try {
      let data: unknown;
      let error: string | undefined;

      try {
        switch (request.operation) {
          case 'fs.list':
            data = await this.listDirectory(request.path || '.', request.depth || 0);
            this.logAction('fs.list', { path: request.path, result: 'success', itemCount: Array.isArray(data) ? data.length : 0 });
            break;

          case 'fs.read':
            const fileContent = await this.readFile(request.path!, request.encoding || 'utf8');
            data = { content: fileContent };
            this.logAction('fs.read', { path: request.path, result: 'success', size: fileContent.length });
            break;

          case 'fs.write':
            await this.writeFile(request.path!, request.content || '', request.createDirs ?? true, request.encoding || 'utf8');
            data = { success: true };
            this.logAction('fs.write', { path: request.path, result: 'success', size: request.content?.length || 0 });
            break;

          case 'fs.delete':
            await this.deleteFile(request.path!, request.recursive ?? false);
            data = { success: true };
            this.logAction('fs.delete', { path: request.path, recursive: request.recursive, result: 'success' });
            break;

          case 'fs.move':
            await this.moveFile(request.source!, request.destination!, request.createDestDirs ?? true);
            data = { success: true };
            this.logAction('fs.move', { source: request.source, destination: request.destination, result: 'success' });
            break;

          case 'exec.run':
            const execResult = await this.executeCommand(request.command!, request.cwd, request.timeoutMs);
            data = execResult;
            this.logAction('exec.run', {
              command: request.command,
              cwd: request.cwd || undefined,
              exitCode: execResult.exitCode,
              result: execResult.exitCode === 0 ? 'success' : 'error',
              stdoutLength: execResult.stdout?.length || 0,
              stderrLength: execResult.stderr?.length || 0,
            });
            break;

          default:
            error = `Unknown operation: ${request.operation}`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        this.logAction(request.operation, {
          path: request.path,
          command: request.command,
          result: 'error',
          error: error,
        });
      }

      this.sendResponse(request.id, data, error);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logAction(request.operation, {
        path: request.path,
        command: request.command,
        result: 'error',
        error: errorMessage,
      });
      this.sendResponse(request.id, undefined, errorMessage);
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
    
    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// CLI interface
async function main() {
  // Try to read config.json first (for Phase 1: pre-built binaries)
  // Use same paths as installer generates
  const agentDir = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE || 'C:\\Users\\User', 'op15-agent')
    : path.join(process.env.HOME || '/home/user', '.op15-agent');
  const configPath = path.join(agentDir, 'config.json');
  
  let serverUrl: string;
  let userId: string;
  let authToken: string | undefined;
  let sharedSecret: string | undefined;
  
  // Try to read from config.json
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    serverUrl = config.serverUrl;
    userId = config.userId;
    sharedSecret = config.sharedSecret;
    authToken = sharedSecret; // Use sharedSecret as auth token for now
    if (config.httpPort) {
      process.env.AGENT_HTTP_PORT = String(config.httpPort);
    }
    console.log('📋 Loaded configuration from:', configPath);
  } catch (error) {
    // Fall back to command-line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Usage: local-agent <server-url> <user-id> [auth-token]');
      console.error('   Or: Place config.json in ~/.op15-agent/config.json');
      console.error('Example: local-agent https://your-app.up.railway.app user_123abc');
      process.exit(1);
    }

    [serverUrl, userId, authToken] = args;
  }
  
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
    
    // Keep the process alive - wait forever
    // The WebSocket connection and event loop will keep the process running
    // This prevents Node.js from exiting when main() completes
    await new Promise(() => {}); // Never resolves
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { LocalAgent };

