/**
 * HTTP Client for communicating with local agent daemon
 * Uses HTTP API instead of WebSocket for operations (more reliable)
 */

import { logger } from '@/lib/utils/logger';

export interface AgentStatus {
  connected: boolean;
  userId: string;
  hasPermissions: boolean;
  mode: 'safe' | 'balanced' | 'unrestricted' | null;
  allowedDirectories: string[];
  allowedOperations: string[];
  isShuttingDown: boolean;
}

export interface AgentLog {
  timestamp: number;
  userId: string;
  operation: string;
  path?: string;
  command?: string;
  result: 'success' | 'error' | 'denied';
  details: Record<string, unknown>;
}

export interface PlanApprovalRequest {
  mode: 'safe' | 'balanced' | 'unrestricted';
  allowedDirectories: string[];
  allowedOperations: ('read' | 'write' | 'delete' | 'exec')[];
  approvedPlan?: Array<{ id: string; operation: string; args: Record<string, unknown> }>;
}

export class AgentHttpClient {
  private baseUrl: string;

  constructor(agentHttpPort: number = 4001) {
    this.baseUrl = `http://127.0.0.1:${agentHttpPort}`;
  }

  /**
   * Execute an operation via HTTP API
   */
  async executeOperation(
    operation: 'fs.list' | 'fs.read' | 'fs.write' | 'fs.delete' | 'fs.move' | 'exec.run',
    args: Record<string, unknown>
  ): Promise<unknown> {
    const endpoint = this.getEndpointForOperation(operation);
    
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Agent HTTP request failed', error instanceof Error ? error : undefined, {
        operation,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get agent status
   */
  async getStatus(): Promise<AgentStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to get agent status', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Approve a plan
   */
  async approvePlan(plan: PlanApprovalRequest): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/plan/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to approve plan', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Activate kill switch
   */
  async kill(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/kill`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to activate kill switch', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get action logs
   */
  async getLogs(limit: number = 100): Promise<{ logs: AgentLog[]; total: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/logs?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to get logs', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get HTTP endpoint for operation
   */
  private getEndpointForOperation(operation: string): string {
    const operationMap: Record<string, string> = {
      'fs.list': '/fs/list',
      'fs.read': '/fs/read',
      'fs.write': '/fs/write',
      'fs.delete': '/fs/delete',
      'fs.move': '/fs/move',
      'exec.run': '/execute',
    };
    return operationMap[operation] || '/execute';
  }
}

