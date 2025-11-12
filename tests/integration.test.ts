import { describe, it, expect } from 'vitest';
import { executeTool } from '@/lib/tools/handlers';
import { getDefaultUserContext } from '@/lib/types/user-context';
import { promises as fs } from 'fs';
import path from 'path';

const context = getDefaultUserContext();
const testFile = path.join(process.env.HOME || '/home/dp', 'test-integration.txt');
const movedTestFile = path.join(process.env.HOME || '/home/dp', 'Documents', 'test-integration-moved.txt');

describe('Integration Test - Chat Loop Simulation', () => {
  it('should simulate a complete conversation flow with all four tools', async () => {
    // Step 1: "Scan my home directory." → calls index.scan
    const scanResult = await executeTool(
      'index.scan',
      {
        root: process.env.HOME || '/home/dp',
        maxDepth: 2,
        followSymlinks: false,
        enableRAG: false,
      },
      context
    );

    expect(scanResult).toHaveProperty('count');
    expect((scanResult as any).count).toBeGreaterThan(10);
    console.log('✅ Step 1: index.scan completed');

    // Step 2: "List my downloads." → calls fs.list
    const downloadsPath = path.join(process.env.HOME || '/home/dp', 'Downloads');
    let listResult;
    try {
      await fs.access(downloadsPath);
      listResult = await executeTool(
        'fs.list',
        { path: downloadsPath },
        context
      );
      expect(Array.isArray(listResult)).toBe(true);
      console.log('✅ Step 2: fs.list completed');
    } catch {
      // Downloads might not exist, use Documents instead
      const documentsPath = path.join(process.env.HOME || '/home/dp', 'Documents');
      listResult = await executeTool(
        'fs.list',
        { path: documentsPath },
        context
      );
      expect(Array.isArray(listResult)).toBe(true);
      console.log('✅ Step 2: fs.list completed (using Documents)');
    }

    // Step 3: "Move test.txt to Documents." → calls fs.move
    // Create test file first
    try {
      await fs.writeFile(testFile, 'integration test content', 'utf8');
    } catch {
      // File might already exist
    }

    // Ensure Documents directory exists
    const documentsDir = path.join(process.env.HOME || '/home/dp', 'Documents');
    try {
      await fs.mkdir(documentsDir, { recursive: true });
    } catch {
      // Already exists
    }

    const moveResult = await executeTool(
      'fs.move',
      {
        source: testFile,
        destination: movedTestFile,
        createDestDirs: true,
      },
      context
    );

    expect(moveResult).toEqual({ success: true });

    // Verify file was moved
    try {
      const content = await fs.readFile(movedTestFile, 'utf8');
      expect(content).toBe('integration test content');
      console.log('✅ Step 3: fs.move completed');
    } catch (error) {
      throw new Error(`File move verification failed: ${error}`);
    }

    // Cleanup moved file
    try {
      await fs.unlink(movedTestFile);
    } catch {
      // Ignore cleanup errors
    }

    // Step 4: "Run uname -a." → calls exec.run
    const execResult = await executeTool(
      'exec.run',
      { command: 'uname -a' },
      context
    );

    expect(execResult).toHaveProperty('exitCode');
    expect(execResult).toHaveProperty('stdout');
    expect((execResult as any).exitCode).toBe(0);
    expect((execResult as any).stdout).toContain('Linux');
    console.log('✅ Step 4: exec.run completed');

    // Verify formatted output sections would be present
    // (In real chat, these would be formatted with emojis: 🧭, 💻, 📂)
    console.log('\n✅ All integration steps completed successfully!');
  });
});

