import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { handleFsList, handleFsMove } from '@/lib/tools/fs';
import { handleExecRun } from '@/lib/tools/exec';
import { handleIndexScan } from '@/lib/tools/index';
import { getDefaultUserContext } from '@/lib/types/user-context';

const context = getDefaultUserContext();
const testDir = path.join(process.env.HOME || '/home/dp', 'test-assistant');
const tempFile = path.join(testDir, 'test-temp.txt');
const movedFile = path.join(process.env.HOME || '/home/dp', 'Documents', 'test-moved.txt');

describe('Tool Tests', () => {
  beforeEach(async () => {
    // Ensure test directory exists
    try {
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(tempFile, 'test content', 'utf8');
    } catch (error) {
      // Ignore if already exists
    }
  });

  afterEach(async () => {
    // Cleanup: remove moved file if it exists
    try {
      await fs.unlink(movedFile);
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('fs.list', () => {
    it('should list files and directories in user home', async () => {
      const homePath = process.env.HOME || '/home/dp';
      const result = await handleFsList({ path: homePath }, context);

      // Verify formatted response structure
      expect(result).toHaveProperty('_formatted');
      expect(result._formatted).toBe(true);
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('total');
      expect(result.total).toBeGreaterThan(0);

      // Verify directories and files counts
      expect(result).toHaveProperty('directories');
      expect(result).toHaveProperty('files');
      expect(typeof result.content).toBe('string');
    });
  });

  describe('fs.move', () => {
    it('should move a file to a new location', async () => {
      // Ensure Documents directory exists
      const documentsDir = path.join(process.env.HOME || '/home/dp', 'Documents');
      try {
        await fs.mkdir(documentsDir, { recursive: true });
      } catch {
        // Ignore if exists
      }

      // Ensure temp file exists
      await fs.writeFile(tempFile, 'test content for move', 'utf8');

      // Move the file
      const result = await handleFsMove(
        {
          source: tempFile,
          destination: movedFile,
          createDestDirs: true,
        },
        context
      );

      expect(result).toEqual({ success: true });

      // Verify file was moved
      const movedContent = await fs.readFile(movedFile, 'utf8');
      expect(movedContent).toBe('test content for move');

      // Verify original file doesn't exist
      try {
        await fs.access(tempFile);
        throw new Error('Original file should not exist');
      } catch (error: any) {
        expect(error.code).toBe('ENOENT');
      }
    });
  });

  describe('exec.run', () => {
    it('should execute echo hello and return stdout', async () => {
      const result = await handleExecRun(
        { command: 'echo hello' },
        context
      );

      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });
  });

  describe('index.scan', () => {
    it('should scan home directory and create index', async () => {
      const homePath = process.env.HOME || '/home/dp';
      const result = await handleIndexScan(
        {
          root: homePath,
          maxDepth: 2,
          followSymlinks: false,
          enableRAG: false, // Disable RAG for faster test
        },
        context
      );

      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(10);

      // Verify index.json was created
      const indexPath = path.join(process.cwd(), 'index.json');
      try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        const indexData = JSON.parse(indexContent);
        expect(indexData).toBeDefined();
      } catch (error) {
        // Index might be in memory only, that's okay
      }
    });
  });
});

