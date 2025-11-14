# Application Architecture Diagram

```
                                     ┌───────────────────────┐
                                     │       User Input       │
                                     │  (Chat UI / Prompt)    │
                                     └────────────┬───────────┘
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │   Next.js API Route      │
                                     │  (/api/chat/route.ts)    │
                                     │  (Streaming SSE Handler)  │
                                     └────────────┬─────────────┘
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │     LLM (Gemini 2.5)     │
                                     │  (GeminiClient.streamChat)│
                                     │  Reasoning + Function     │
                                     │  Calling (Tool Selection)│
                                     └────────────┬─────────────┘
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │    Tool Router           │
                                     │  (executeTool)           │
                                     │  Routes to Handlers      │
                                     └────────────┬─────────────┘
                                                  │
                        ┌─────────────────────────┼─────────────────────────┐
                        │                         │                         │
                        ▼                         ▼                         ▼
        ┌──────────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐
        │  File System Tools       │   │  Command Execution  │   │   Web Search Tool      │
        │  (fs.list, fs.read,      │   │  (exec.run)         │   │   (brave.search)       │
        │   fs.write, fs.delete,  │   │                     │   │   Direct Brave API    │
        │   fs.move, fs.copy,     │   │  • Syncs workspace  │   │   Call (no browser)   │
        │   fs.create)            │   │    if bridge conn.   │   └─────────────┬──────────┘
        │                         │   │  • Executes in temp │                 │
        │  • Uses browser bridge  │   │    workspace dir    │                 ▼
        │    if connected (WS)    │   └────────────┬────────┘      ┌──────────────────────────────┐
        │  • Falls back to        │                │               │   Structured Search Output   │
        │    server-side if not   │                │               │ (ranked sources + quotes)    │
        └────────────┬────────────┘                │               └────────────┬────────────────┘
                     │                             │                            │
                     │                             │                            │
                     ▼                             ▼                            ▼
        ┌──────────────────────────┐   ┌──────────────────┐         ┌──────────────────────────────┐
        │  Browser Bridge          │   │  Command Executor │         │    Normalized Results        │
        │  (Optional - WebSocket)  │   │  (SimpleToolExec) │         │ (merged + formatted)        │
        │                          │   │                  │         └────────────┬────────────────┘
        │  • File System Access    │   │  • Runs commands │                     │
        │    API (Browser)         │   │  • Streams output│                     │
        │  • WebSocket to server   │   │  • Returns result│                     │
        │  • Local file access     │   └─────────┬────────┘                     │
        └────────────┬─────────────┘             │                              │
                     │                           │                              │
                     ▼                           │                              │
        ┌──────────────────────────┐            │                              │
        │  User's Local Machine    │            │                              │
        │  (File System Access)    │            │                              │
        └──────────────────────────┘            │                              │
                                                 │                              │
                        ┌────────────────────────┴──────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────────────────────────┐
        │              Additional Tools                                │
        │                                                              │
        │  • Image Generation (imagen.generate) → Google Imagen API   │
        │  • Indexing (index.scan, index.find) → Memory Index         │
        │  • Text Search (text.search) → Server-side file search      │
        │  • Editor (editor.open) → Server-side file read              │
        └────────────────────────────┬────────────────────────────────┘
                                     │
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────────────┐
        │                    Tool Results                              │
        │              (Returned to LLM)                               │
        └────────────────────────────┬────────────────────────────────┘
                                     │
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────────────┐
        │              Streaming Response Handler                      │
        │              (SSE Event Stream)                             │
        │                                                              │
        │  • text chunks                                              │
        │  • function_call events                                      │
        │  • function_response events                                  │
        │  • formatted_search events (for UI)                         │
        │  • editor_open events                                        │
        │  • image_generated events                                    │
        └────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────────────┐
        │                    Chat UI Rendering                          │
        │                                                              │
        │  • Thinking UI (processing indicator)                        │
        │  • Tool call visualization                                   │
        │  • Streaming text display                                    │
        │  • Formatted search results (images, videos, sources)       │
        │  • Editor panel (file viewer)                                 │
        │  • Image viewer panel                                        │
        │  • Video viewer panel                                        │
        └─────────────────────────────────────────────────────────────┘
```

## Key Architecture Points

### 1. **No Separate Browser Agent**
   - Browser bridge is integrated directly into file system tools
   - Uses File System Access API (not Playwright)
   - WebSocket connection for local file access

### 2. **Tool Execution Flow**
   - LLM selects tools via function calling
   - `executeTool` routes to specific handlers
   - Each tool handler executes independently
   - Results returned to LLM for continued reasoning

### 3. **Browser Bridge (Optional)**
   - Only used when user connects local environment
   - Provides local file system access via WebSocket
   - Falls back to server-side if not connected
   - Used by: `fs.*` tools and `exec.run` (for workspace sync)

### 4. **Streaming Architecture**
   - Server-Sent Events (SSE) for real-time updates
   - Multiple event types: text, function_call, function_response, formatted_search, etc.
   - Chat UI renders events as they arrive

### 5. **Tool Categories**
   - **File System**: fs.* (uses bridge if connected)
   - **Command Execution**: exec.run (syncs workspace if bridge connected)
   - **Web Search**: brave.search (direct API call)
   - **Image Generation**: imagen.generate (direct API call)
   - **Indexing**: index.* (server-side memory index)
   - **Text Search**: text.search (server-side)
   - **Editor**: editor.open (server-side file read)

