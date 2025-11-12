# System Prompt Implementation Guide

## Overview

This guide documents the optimal implementation of the system prompt for the local environment assistant. The implementation includes:

1. **Enhanced System Prompt** (`lib/llm/system-prompt.ts`)
2. **Response Formatter Utility** (`lib/llm/response-formatter.ts`)
3. **Integration** with existing Gemini client

## Files Created/Modified

### New Files
- `lib/llm/system-prompt.ts` - Centralized system prompt definition
- `lib/llm/response-formatter.ts` - Utilities for parsing and formatting responses
- `SYSTEM_PROMPT_REVIEW.md` - Detailed review and analysis
- `IMPLEMENTATION_GUIDE.md` - This file

### Modified Files
- `lib/llm/gemini.ts` - Updated to import system prompt from separate file

## Key Features

### 1. Structured Response Format

The system prompt enforces a consistent format:

```
**🧭 Command Summary**
[What is being done]

**💻 Executed Action**
[Tool call details]

**📂 Result**
[Formatted output]

✅/⚠️/❌ [Status]
```

### 2. Enhanced Error Handling

- Clear distinction between error types
- Suggestions for recovery
- Proper status indicators

### 3. Confirmation Flow

- Automatic confirmation requests for destructive operations
- Simple confirmation acceptance ("yes", "no", "ok", "cancel")
- Clear cancellation messages

### 4. Flexible Formatting

- Standard format for tool calls
- Informational format for non-tool responses
- Multi-step operation support

## Usage

### Basic Usage

The system prompt is automatically used by the Gemini client:

```typescript
import { GeminiClient } from "@/lib/llm/gemini";

const client = new GeminiClient();
// System prompt is automatically included
```

### Response Formatting (Optional)

Use the formatter utilities to validate or reformat responses:

```typescript
import { 
  parseResponse, 
  isValidFormat, 
  formatToolResult 
} from "@/lib/llm/response-formatter";

// Parse a response
const parsed = parseResponse(llmResponse);

// Check if format is valid
if (!isValidFormat(llmResponse)) {
  console.warn("Response doesn't follow expected format");
}

// Format a tool result manually (if needed)
const formatted = formatToolResult(
  "Listing files",
  "fs.list(path='/home/user')",
  "Files: file1.txt, file2.txt",
  "success"
);
```

## Response Format Examples

### Listing Files

```
**🧭 Command Summary**
Listing all contents in `/home/dp`.

**💻 Executed Action**
fs.list(path="/home/dp")

**📂 Result**
Files: .bashrc, aiartifacts.txt, testingAI.txt  
Directories: Desktop, Documents, Downloads, Pictures

✅ Successfully listed 3 files and 4 directories.
```

### Executing Commands

```
**🧭 Command Summary**
Running system command to show OS info.

**💻 Executed Action**
exec.run(command="uname -a")

**📂 Result**
Linux dp-machine 6.8.0-45-generic #3 SMP x86_64 GNU/Linux  
(exitCode: 0)

✅ Command executed successfully.
```

### Error Handling

```
**🧭 Command Summary**
Attempting to list contents of `/nonexistent/path`.

**💻 Executed Action**
fs.list(path="/nonexistent/path")

**📂 Result**
❌ Error: Path `/nonexistent/path` does not exist.

Would you like me to search for similar paths?
```

## Customization

### Modifying the System Prompt

Edit `lib/llm/system-prompt.ts`:

```typescript
export const SYSTEM_PROMPT = `Your custom prompt here...`;
```

The changes will automatically be used by the Gemini client.

### Adding Custom Formatters

Extend `lib/llm/response-formatter.ts`:

```typescript
export function formatCustomResult(...args: any[]): string {
  // Your custom formatting logic
}
```

## Testing

### Manual Testing

Test the system prompt with various scenarios:

1. **Simple listing**: "List files in ~/Downloads"
2. **Move operation**: "Move file.txt to Documents"
3. **Command execution**: "Run ls -la"
4. **Error cases**: "List /nonexistent/path"
5. **Multi-step**: "Find all .txt files and move them to archive"

### Validation

Use the formatter utilities to validate responses:

```typescript
import { isValidFormat } from "@/lib/llm/response-formatter";

// In your tests
const response = await getLLMResponse("List files");
expect(isValidFormat(response)).toBe(true);
```

## Best Practices

1. **Keep the prompt focused**: Don't add too many rules that conflict
2. **Test edge cases**: Ensure the format works for all scenarios
3. **Monitor LLM adherence**: Check if responses follow the format
4. **Iterate based on feedback**: Adjust the prompt based on actual usage

## Troubleshooting

### LLM Not Following Format

If the LLM doesn't consistently follow the format:

1. **Check prompt clarity**: Ensure examples are clear
2. **Use formatter**: Post-process responses if needed
3. **Adjust temperature**: Lower temperature (0.1-0.3) for more consistent formatting
4. **Add validation**: Use `isValidFormat()` to detect issues

### Format Too Rigid

If the format feels too rigid:

1. **Make it optional**: Only enforce for tool calls
2. **Add flexibility**: Allow variations for edge cases
3. **Use formatter**: Reformat only when needed

## Future Enhancements

Potential improvements:

1. **Structured Output**: Use Gemini's structured output for guaranteed format
2. **Response Templates**: Pre-defined templates for common operations
3. **Format Validation**: Automatic validation and correction
4. **User Preferences**: Allow users to customize format
5. **Confirmation UI**: Frontend integration for confirmation flow

## Related Documentation

- `SYSTEM_PROMPT_REVIEW.md` - Detailed review and analysis
- `README.md` - Project overview
- `BUILD_PLAN.md` - Original build plan

