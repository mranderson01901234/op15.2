/**
 * Workspace sync endpoint
 * Receives workspace files from browser for exec.run operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/utils/logger';

const requestSchema = {
  userId: 'string',
  files: 'array',
  command: 'string',
};

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, files, command } = body;

    // Verify user ID matches
    if (userId !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid files array' }, { status: 400 });
    }

    logger.info('Workspace sync request', {
      userId,
      fileCount: files.length,
      command,
    });

    // Create temporary workspace directory for this user
    const tempWorkspaceRoot = path.join('/tmp', 'workspaces', userId);
    const workspaceId = `workspace-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const workspacePath = path.join(tempWorkspaceRoot, workspaceId);

    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });

    // Write all files to workspace
    for (const file of files) {
      if (!file.path || file.content === undefined) {
        continue;
      }

      const filePath = path.join(workspacePath, file.path);
      const fileDir = path.dirname(filePath);

      // Create parent directories if needed
      await fs.mkdir(fileDir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    logger.info('Workspace synced', {
      userId,
      workspacePath,
      fileCount: files.length,
    });

    // Store workspace path in a way that exec.run can access it
    // In production, use Redis or database. For now, use a simple in-memory store
    if (typeof global !== 'undefined') {
      if (!(global as any).userWorkspaces) {
        (global as any).userWorkspaces = new Map();
      }
      (global as any).userWorkspaces.set(userId, {
        workspacePath,
        workspaceId,
        syncedAt: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      workspacePath,
      workspaceId,
      fileCount: files.length,
    });
  } catch (error) {
    logger.error('Workspace sync error', error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

