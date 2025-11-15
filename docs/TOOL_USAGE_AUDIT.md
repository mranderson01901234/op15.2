# Tool Usage Audit

This document defines when tools should and should NOT be used by the LLM.

## Overview

The system has multiple ways to accomplish tasks:
1. **Direct API calls** - Handled by the chat route before sending to LLM
2. **Tool calls** - LLM invokes tools via function calling
3. **Natural language responses** - LLM answers directly without tools

## Tool Registry

Current tools available to the LLM:
1. `fs.list` - List files and directories
2. `fs.read` - Read file contents
3. `fs.write` - Write file contents
4. `fs.move` - Move/rename files
5. `fs.copy` - Copy files/directories
6. `fs.delete` - Delete files/directories
7. `fs.create` - Create directories
8. `exec.run` - Execute shell commands
9. `index.scan` - Build file index
10. `index.find` - Search file index
11. `text.search` - Search text in files
12. `editor.open` - Open file in editor
13. `brave.search` - Web search (ONLY for current events/recent news)
14. `imagen.generate` - **DEPRECATED** - Use direct API instead

## When to Use Tools vs Direct API

### ❌ DO NOT USE TOOLS FOR:

#### 1. Image Generation (`imagen.generate`)
**Status:** DEPRECATED - Should use direct API route

**Why:** Image generation should be handled directly by the chat route before sending to the LLM. This provides:
- Faster response times
- Better error handling
- Cleaner architecture
- Direct control over image display

**Implementation:**
- Chat route detects image generation requests using pattern matching
- Calls `/api/imagen/generate` directly
- Returns image to frontend without LLM tool call
- LLM should NOT call `imagen.generate` tool

**Detection Patterns:**
- "generate an image of..."
- "create an image of..."
- "make an image of..."
- "draw an image of..."
- "show me an image of..."
- "I want an image of..."
- "can you generate..."
- "generate a picture of..."

**Action:** Remove `imagen.generate` from FUNCTION_REGISTRY or mark as deprecated

---

### ✅ USE TOOLS FOR:

#### 1. File System Operations (`fs.*`)
**When to use:**
- User asks to list, read, write, move, copy, delete, or create files/directories
- User wants to explore the filesystem
- User wants to modify file contents
- User wants to organize files

**Examples:**
- "List files in /home/user"
- "Read the README.md file"
- "Create a new file called test.txt"
- "Move file.txt to Documents/"
- "Delete old.log"

#### 2. Command Execution (`exec.run`)
**When to use:**
- User asks to run shell commands
- User wants to execute scripts
- User wants to check system status
- User wants to install packages or run build commands

**Examples:**
- "Run npm install"
- "Execute the build script"
- "Check git status"
- "List running processes"

**When NOT to use:**
- For simple information that can be answered directly
- For general knowledge questions

#### 3. File Indexing (`index.scan`, `index.find`)
**When to use:**
- User asks to find a file but path is unknown
- User wants to search for files by name
- User wants to build an index of a directory tree

**Examples:**
- "Find all .js files"
- "Where is config.json?"
- "Search for files containing 'test'"

#### 4. Text Search (`text.search`)
**When to use:**
- User wants to search for text patterns in files
- User wants to find occurrences of specific text
- User wants to search with regex patterns

**Examples:**
- "Find all occurrences of 'TODO'"
- "Search for 'function' in JavaScript files"
- "Find files containing 'error'"

#### 5. Editor Operations (`editor.open`)
**When to use:**
- User asks to open a file in the editor
- User wants to view/edit a specific file
- User says "open", "edit", "show me" referring to a file

**Examples:**
- "Open package.json"
- "Edit the config file"
- "Show me the main.ts file"

#### 6. Web Search (`brave.search`)
**When to use:**
- User explicitly asks about current events
- User asks about recent news
- User asks about information that requires up-to-date web knowledge
- User asks "what happened recently" or "latest news"

**When NOT to use:**
- General knowledge questions (use training data)
- Historical information
- Technical documentation
- Code examples

**Examples:**
- ✅ "What happened in the news today?"
- ✅ "Latest updates on AI developments"
- ❌ "What is React?"
- ❌ "How do I use async/await?"

---

## Direct API Routes (No Tool Calls)

These operations should be handled directly by the chat route or frontend:

### 1. Image Generation (`/api/imagen/generate`)
- **Status:** Direct API call from chat route
- **Detection:** Pattern matching in chat route before LLM
- **Response:** Direct image display, no tool call needed

### 2. PDF Upload (`/api/pdf/upload`)
- **Status:** Direct API call from frontend
- **Handling:** PDFs are passed to LLM as context, not via tool

---

## System Prompt Guidelines

The system prompt should clearly state:

1. **Image Generation:**
   - "DO NOT use imagen.generate tool"
   - "Image generation requests are handled automatically"
   - "When user asks to generate an image, acknowledge that it will be generated"

2. **Web Search:**
   - "ONLY use brave.search for current events and recent news"
   - "DO NOT use brave.search for general knowledge"

3. **File Operations:**
   - "Always use fs.* tools for file operations"
   - "Use index.find when filename is known but path is unknown"

4. **Editor Operations:**
   - "Use editor.open when user asks to open or edit a file"

---

## Implementation Plan

### Phase 1: Image Generation Direct API
- [x] Create detection function for image generation requests
- [ ] Update chat route to intercept image requests
- [ ] Call `/api/imagen/generate` directly
- [ ] Remove or deprecate `imagen.generate` from tool registry
- [ ] Update system prompt

### Phase 2: Tool Usage Refinement
- [ ] Review all tool descriptions for clarity
- [ ] Add explicit "when NOT to use" guidance
- [ ] Update examples in system prompt
- [ ] Test tool selection accuracy

### Phase 3: Monitoring
- [ ] Add logging for tool usage
- [ ] Track incorrect tool usage
- [ ] Monitor direct API vs tool call patterns

---

## Detection Patterns

### Image Generation Detection
```typescript
const IMAGE_GENERATION_PATTERNS = [
  /generate\s+(an\s+)?image\s+of/i,
  /create\s+(an\s+)?image\s+of/i,
  /make\s+(an\s+)?image\s+of/i,
  /draw\s+(an\s+)?image\s+of/i,
  /show\s+me\s+(an\s+)?image\s+of/i,
  /I\s+want\s+(an\s+)?image\s+of/i,
  /can\s+you\s+generate/i,
  /generate\s+a\s+picture\s+of/i,
];
```

### Web Search Detection (for validation)
```typescript
const WEB_SEARCH_KEYWORDS = [
  'current events',
  'recent news',
  'latest',
  'what happened',
  'today',
  'this week',
  'up-to-date',
];
```

---

## Testing Checklist

- [ ] Image generation requests bypass tool calls
- [ ] Image generation works without LLM tool invocation
- [ ] Other tools still work correctly
- [ ] System prompt reflects new guidelines
- [ ] Error handling for direct API calls
- [ ] Frontend displays images correctly

