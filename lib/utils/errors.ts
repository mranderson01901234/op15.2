/**
 * Base error class for tool execution
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Validation error for tool arguments
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * File system operation error
 */
export class FileSystemError extends ToolError {
  constructor(
    message: string,
    public readonly path: string,
    cause?: Error
  ) {
    super(message, "fs", cause);
    this.name = "FileSystemError";
  }
}

/**
 * Execution error for shell commands
 */
export class ExecutionError extends ToolError {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode?: number,
    cause?: Error
  ) {
    super(message, "exec", cause);
    this.name = "ExecutionError";
  }
}

