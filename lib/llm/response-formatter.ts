/**
 * Response formatter utility
 * 
 * Ensures responses follow the structured format defined in the system prompt.
 * This is a helper to validate and optionally reformat LLM responses.
 */

export interface FormattedResponse {
  commandSummary?: string;
  executedAction?: string;
  result?: string;
  status?: "success" | "warning" | "error";
  rawText: string;
}

/**
 * Parse a response to extract structured components
 */
export function parseResponse(text: string): FormattedResponse {
  const response: FormattedResponse = { rawText: text };

  // Extract Command Summary (without emoji)
  const commandSummaryMatch = text.match(/\*\*Command Summary\*\*\s*\n([\s\S]+?)(?=\n\*\*|$)/);
  if (commandSummaryMatch) {
    response.commandSummary = commandSummaryMatch[1].trim();
  }

  // Extract Executed Action (without emoji)
  const executedActionMatch = text.match(/\*\*Executed Action\*\*\s*\n([\s\S]+?)(?=\n\*\*|$)/);
  if (executedActionMatch) {
    response.executedAction = executedActionMatch[1].trim();
  }

  // Extract Result (without emoji)
  const resultMatch = text.match(/\*\*Result\*\*\s*\n([\s\S]+?)(?=\n\*\*|Operation completed|Error:|$)/);
  if (resultMatch) {
    response.result = resultMatch[1].trim();
  }

  // Extract status (text-based)
  if (text.includes("Operation completed successfully") || text.match(/Operation completed successfully/i)) {
    response.status = "success";
  } else if (text.includes("Operation completed with warnings") || text.match(/Operation completed with warnings/i)) {
    response.status = "warning";
  } else if (text.includes("Operation failed") || text.match(/Operation failed/i) || text.match(/Error:/i)) {
    response.status = "error";
  }

  return response;
}

/**
 * Check if a response follows the expected format
 */
export function isValidFormat(text: string): boolean {
  const parsed = parseResponse(text);
  
  // If there's a tool call mentioned, we expect the full format
  const hasToolCall = 
    text.includes("fs.list") ||
    text.includes("fs.move") ||
    text.includes("exec.run") ||
    text.includes("index.scan");

  if (hasToolCall) {
    // Should have all three sections
    return !!(
      parsed.commandSummary &&
      parsed.executedAction &&
      parsed.result
    );
  }

  // For non-tool responses, just check for status indicator
  return !!parsed.status || !hasToolCall;
}

/**
 * Format a tool result into the expected structure
 * This can be used to ensure consistent formatting
 */
export function formatToolResult(
  summary: string,
  action: string,
  result: string,
  status: "success" | "warning" | "error" = "success"
): string {
  const statusText = {
    success: "Operation completed successfully.",
    warning: "Operation completed with warnings.",
    error: "Operation failed.",
  }[status];

  return `${summary}

${action}

${result}

${statusText}`;
}

/**
 * Format a list result
 */
export function formatListResult(
  path: string,
  files: string[],
  directories: string[]
): string {
  const fileSection = files.length > 0 ? `Files: ${files.join(", ")}` : "";
  const dirSection = directories.length > 0 ? `Directories: ${directories.join(", ")}` : "";
  
  return [fileSection, dirSection].filter(Boolean).join("\n");
}

/**
 * Format an exec result
 */
export function formatExecResult(
  command: string,
  output: string,
  exitCode: number
): string {
  return `${output}\n(exitCode: ${exitCode})`;
}

/**
 * Format a move result
 */
export function formatMoveResult(
  source: string,
  destination: string
): string {
  return `File successfully moved from \`${source}\` → \`${destination}\``;
}

/**
 * Format a scan result
 */
export function formatScanResult(
  root: string,
  count: number,
  durationMs: number
): string {
  const durationSec = (durationMs / 1000).toFixed(2);
  return `Indexed ${count} paths under \`${root}\` in ${durationSec}s`;
}

