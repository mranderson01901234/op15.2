import { describe, it, expect } from 'vitest';
import { handleFsList, handleFsRead } from '@/lib/tools/fs';
import { getDefaultUserContext } from '@/lib/types/user-context';

describe('Security Tests', () => {
  describe('Path Traversal Protection', () => {
    it('should block path traversal attempts with ../', async () => {
      const context = getDefaultUserContext();

      // Attempt to access /etc/passwd via path traversal
      await expect(
        handleFsList({ path: '../../../etc' }, context)
      ).rejects.toThrow(/path traversal|outside workspace/i);
    });

    it('should block absolute paths outside workspace root', async () => {
      const context = getDefaultUserContext();

      // Attempt to read /etc/passwd directly
      await expect(
        handleFsRead({ path: '/etc/passwd' }, context)
      ).rejects.toThrow(/path traversal|outside workspace|permission denied/i);
    });

    it('should block access to sensitive system files', async () => {
      const context = getDefaultUserContext();

      const sensitivePaths = [
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        '/etc/passwd',
      ];

      for (const path of sensitivePaths) {
        await expect(
          handleFsRead({ path }, context)
        ).rejects.toThrow(); // Should throw any error (traversal or permission)
      }
    });

    it('should allow paths within workspace root', async () => {
      const context = getDefaultUserContext();

      // This should work - accessing current directory
      const result = await handleFsList({ path: '.' }, context);
      expect(result).toHaveProperty('_formatted');
      expect(result._formatted).toBe(true);
    });
  });

  describe('Command Execution Sandboxing', () => {
    it('should allow whitelisted commands', async () => {
      const { validateCommand } = await import('@/lib/tools/command-validator');

      const testUserId = 'test-user';

      // These should succeed
      expect(() => validateCommand('ls -la', testUserId)).not.toThrow();
      expect(() => validateCommand('git status', testUserId)).not.toThrow();
      expect(() => validateCommand('echo hello', testUserId)).not.toThrow();
      expect(() => validateCommand('npm --version', testUserId)).not.toThrow();
    });

    it('should block dangerous commands', async () => {
      const { validateCommand } = await import('@/lib/tools/command-validator');

      const testUserId = 'test-user';

      // These should fail
      expect(() => validateCommand('rm -rf /', testUserId)).toThrow(/not allowed/i);
      expect(() => validateCommand('curl https://evil.com', testUserId)).toThrow(/not allowed/i);
      expect(() => validateCommand('wget malware.sh', testUserId)).toThrow(/not allowed/i);
      expect(() => validateCommand('sudo rm', testUserId)).toThrow(/not allowed/i);
    });

    it('should block command injection attempts', async () => {
      const { validateCommand } = await import('@/lib/tools/command-validator');

      const testUserId = 'test-user';

      // These should fail
      expect(() => validateCommand('ls; rm -rf /', testUserId)).toThrow(/dangerous character/i);
      expect(() => validateCommand('ls && rm file', testUserId)).toThrow(/dangerous character/i);
      expect(() => validateCommand('ls | grep test', testUserId)).toThrow(/dangerous character/i);
      expect(() => validateCommand('$(malicious command)', testUserId)).toThrow(/dangerous character/i);
    });

    it('should block unsafe git commands', async () => {
      const { validateCommand } = await import('@/lib/tools/command-validator');

      const testUserId = 'test-user';

      // Safe git commands should work
      expect(() => validateCommand('git status', testUserId)).not.toThrow();
      expect(() => validateCommand('git log', testUserId)).not.toThrow();

      // Unsafe git commands should be blocked
      expect(() => validateCommand('git push', testUserId)).toThrow(/not allowed/i);
      expect(() => validateCommand('git config', testUserId)).toThrow(/not allowed/i);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const { checkRateLimit } = await import('@/lib/middleware/rate-limit');

      const testUserId = 'test-user-' + Date.now();

      // First request should succeed
      const result1 = await checkRateLimit(testUserId, 'chat');
      expect(result1.success).toBe(true);
      expect(result1.remaining).toBeLessThan(result1.limit);
    });

    it('should block requests exceeding rate limit', async () => {
      const { checkRateLimit, RATE_LIMITS } = await import('@/lib/middleware/rate-limit');

      const testUserId = 'test-user-spam-' + Date.now();
      const limit = RATE_LIMITS.chat.maxRequests;

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        const result = await checkRateLimit(testUserId, 'chat');
        expect(result.success).toBe(true);
      }

      // Next request should be blocked
      const blockedResult = await checkRateLimit(testUserId, 'chat');
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });

    it('should reset rate limit after time window', async () => {
      const { checkRateLimit } = await import('@/lib/middleware/rate-limit');

      const testUserId = 'test-user-reset-' + Date.now();

      const result1 = await checkRateLimit(testUserId, 'chat');
      expect(result1.success).toBe(true);

      const resetTime = result1.reset;
      expect(resetTime).toBeGreaterThan(Date.now());
    });
  });
});
