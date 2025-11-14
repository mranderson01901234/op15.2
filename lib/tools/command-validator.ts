/**
 * Command validation and sandboxing utilities
 * Provides whitelist-based command execution with strict validation
 */

import { ExecutionError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * Allowed commands whitelist
 * Only these commands can be executed
 */
const ALLOWED_COMMANDS = new Set([
  // File operations (read-only)
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'grep',
  'tree',
  'stat',
  'file',
  'wc',

  // Directory navigation
  'pwd',
  'cd', // Note: cd won't work in spawn, but included for clarity

  // Version control (read-only)
  'git',

  // Package managers (read-only commands)
  'npm',
  'pnpm',
  'yarn',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',

  // Build tools
  'make',
  'cargo',
  'go',
  'rustc',
  'gcc',
  'clang',

  // System info (read-only)
  'uname',
  'whoami',
  'hostname',
  'date',
  'uptime',
  'df',
  'du',
  'ps',
  'top', // Will timeout quickly
  'env',
  'printenv',

  // Text processing
  'awk',
  'sed',
  'sort',
  'uniq',
  'cut',
  'tr',
  'diff',
  'patch',

  // Archive operations (read-only)
  'tar',
  'zip',
  'unzip',
  'gzip',
  'gunzip',

  // Misc utilities
  'echo',
  'which',
  'type',
  'whereis',
  'man',
  'help',
]);

/**
 * Commands that should never be allowed (destructive)
 * This is a safety check in case they're added to whitelist by mistake
 */
const BLOCKED_COMMANDS = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'dd',
  'shred',
  'mkfs',
  'fdisk',
  'mount',
  'umount',
  'kill',
  'killall',
  'pkill',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init',
  'systemctl',
  'service',
  'sudo',
  'su',
  'chmod',
  'chown',
  'chgrp',
  'useradd',
  'userdel',
  'passwd',
  'nc',
  'netcat',
  'telnet',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'wget',
  'curl',
  'lynx',
  'links',
]);

/**
 * Dangerous argument patterns that should be blocked
 */
const DANGEROUS_PATTERNS = [
  /--exec/i,
  /--command/i,
  /--eval/i,
  /-e\s+/,
  />\s*\/dev\/null/,
  /\/etc\/shadow/i,
  /\/etc\/passwd/i,
  /\/root\/\.ssh/i,
  /\/proc\/self/i,
  /\/sys\//i,
];

/**
 * Parse command string into command and arguments
 */
function parseCommand(commandStr: string): { command: string; args: string[] } {
  // Simple whitespace split (doesn't handle quoted args perfectly, but good enough for sandboxing)
  const parts = commandStr.trim().split(/\s+/);
  const command = parts[0] || '';
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Validate command is in whitelist and not in blocklist
 */
export function validateCommand(commandStr: string, userId: string): {
  command: string;
  args: string[];
} {
  // Remove leading/trailing whitespace
  const trimmed = commandStr.trim();

  if (!trimmed) {
    throw new ExecutionError('Empty command', commandStr);
  }

  // Check for dangerous characters
  const dangerousChars = [';', '&&', '||', '|', '`', '$', '\n', '\r', '<', '>'];
  for (const char of dangerousChars) {
    if (trimmed.includes(char)) {
      logger.warn('Blocked command with dangerous character', {
        userId,
        command: commandStr,
        character: char === '\n' ? 'newline' : char === '\r' ? 'carriage return' : char,
      });
      throw new ExecutionError(
        `Command contains dangerous character: ${char === '\n' ? 'newline' : char === '\r' ? 'carriage return' : char}. Command chaining and redirection are not allowed.`,
        commandStr
      );
    }
  }

  // Check for command substitution
  if (trimmed.includes('$(') || trimmed.includes('${') || trimmed.includes('`')) {
    logger.warn('Blocked command substitution attempt', {
      userId,
      command: commandStr,
    });
    throw new ExecutionError(
      'Command substitution is not allowed',
      commandStr
    );
  }

  // Parse command
  const { command, args } = parseCommand(trimmed);

  // Check if command is explicitly blocked
  if (BLOCKED_COMMANDS.has(command)) {
    logger.warn('Blocked dangerous command attempt', {
      userId,
      command,
      fullCommand: commandStr,
    });
    throw new ExecutionError(
      `Command '${command}' is not allowed for security reasons. Destructive operations are blocked.`,
      commandStr
    );
  }

  // Check if command is in whitelist
  if (!ALLOWED_COMMANDS.has(command)) {
    logger.warn('Blocked non-whitelisted command', {
      userId,
      command,
      fullCommand: commandStr,
    });
    throw new ExecutionError(
      `Command '${command}' is not whitelisted. Only approved commands can be executed for security reasons.`,
      commandStr
    );
  }

  // Validate arguments don't contain dangerous patterns
  const fullCommand = [command, ...args].join(' ');
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(fullCommand)) {
      logger.warn('Blocked command with dangerous argument pattern', {
        userId,
        command: commandStr,
        pattern: pattern.source,
      });
      throw new ExecutionError(
        `Command contains potentially dangerous arguments. Pattern matched: ${pattern.source}`,
        commandStr
      );
    }
  }

  // Additional validation for specific commands
  if (command === 'git') {
    // Only allow safe git commands (no push, no config changes)
    const gitSubcommand = args[0];
    const safeGitCommands = ['status', 'log', 'diff', 'show', 'branch', 'ls-files', 'ls-tree'];

    if (!gitSubcommand || !safeGitCommands.includes(gitSubcommand)) {
      logger.warn('Blocked unsafe git command', {
        userId,
        command: commandStr,
        subcommand: gitSubcommand,
      });
      throw new ExecutionError(
        `Git command '${gitSubcommand}' is not allowed. Only read-only git commands are permitted.`,
        commandStr
      );
    }
  }

  // Log successful validation
  logger.info('Command validated successfully', {
    userId,
    command,
    argCount: args.length,
  });

  return { command, args };
}

/**
 * Check if command is read-only (safe)
 */
export function isReadOnlyCommand(command: string): boolean {
  const readOnlyCommands = new Set([
    'ls', 'cat', 'head', 'tail', 'find', 'grep', 'tree', 'stat', 'file',
    'pwd', 'uname', 'whoami', 'hostname', 'date', 'uptime', 'df', 'du',
    'git', 'wc', 'awk', 'sed', 'sort', 'uniq', 'cut', 'tr', 'diff',
    'echo', 'which', 'type', 'whereis', 'env', 'printenv',
  ]);

  const { command: cmd } = parseCommand(command);
  return readOnlyCommands.has(cmd);
}
