# Browser Integration Review - 50/50 Split View

## Current State Analysis

### ✅ What's Already Implemented

1. **Split View Component** (`components/layout/split-view.tsx`)
   - ✅ 50/50 split layout with draggable divider
   - ✅ Already checks for `browserState.isOpen` 
   - ✅ Resets to 50/50 when browser opens
   - ✅ Handles browser panel in right 50% view

2. **Workspace Context** (`contexts/workspace-context.tsx`)
   - ✅ `BrowserState` interface with `url`, `title`, `isOpen`
   - ✅ `openBrowser(url, title?)` and `closeBrowser()` methods
   - ✅ Browser state management integrated

3. **Browser Viewer Component** (`components/browser/browser-viewer.tsx`)
   - ✅ Basic iframe-based browser viewer
   - ✅ Navigation controls (back, forward, refresh, home)
   - ✅ URL bar with manual input
   - ✅ Error handling for X-Frame-Options blocking
   - ⚠️ **LIMITATION**: Simple iframe, no advanced browser capabilities

4. **Page Integration** (`app/page.tsx`)
   - ✅ Browser viewer rendered in SplitView's right panel
   - ✅ Browser state checked and displayed conditionally
   - ⚠️ **MISSING**: No `browser_open` event handling in streaming response parser

### ❌ What's Missing (From Integration Guide)

1. **BrowserPanel Component**
   - ❌ Not present - need to copy from reference implementation
   - ❌ Should replace current `BrowserViewer` component
   - ❌ Requires WebSocket connection for real-time updates

2. **API Routes** (`app/api/browser/`)
   - ❌ Directory exists but empty (`app/api/browser/proxy/`)
   - ❌ Missing routes:
     - `POST /api/browser/sessions` - Create browser session
     - `POST /api/browser/navigate` - Navigate to URL
     - `GET /api/browser/read` - Read page content
     - `POST /api/browser/input` - Handle user input
     - `GET /api/browser/capture` - Capture screenshot
     - `DELETE /api/browser/sessions/[sid]` - Close session

3. **Dependencies**
   - ❌ `@browser/mcp-browser` package not installed
   - ❌ Need to add to `package.json`

4. **Environment Variables**
   - ❌ `BROWSER_SERVICE_URL` not configured
   - ❌ `NEXT_PUBLIC_BROWSER_SERVICE_URL` not configured
   - ❌ `BROWSER_ALLOWLIST` not configured (security)

5. **Browser Service**
   - ❌ External browser service not running
   - ❌ Need separate service at `http://localhost:7071`
   - ❌ Requires Playwright/Chromium installation

6. **Streaming Integration**
   - ❌ No `browser_open` event type in SSE parser (`app/page.tsx`)
   - ❌ No integration with LLM tool calls for browser operations

## Integration Requirements

### 1. Component Replacement

**Current**: `BrowserViewer` (simple iframe)
- Basic navigation
- Manual URL input
- No session management
- No WebSocket streaming

**Target**: `BrowserPanel` (from integration guide)
- Session-based browser control
- WebSocket streaming for real-time updates
- Advanced browser capabilities (read, input, capture)
- Integration with browser service

### 2. API Route Structure Needed

```
app/api/browser/
├── sessions/
│   └── route.ts          # POST - Create session
├── navigate/
│   └── route.ts          # POST - Navigate to URL
├── read/
│   └── route.ts          # GET - Read page content
├── input/
│   └── route.ts          # POST - Handle input
├── capture/
│   └── route.ts          # GET - Screenshot
└── sessions/
    └── [sid]/
        └── route.ts      # DELETE - Close session
```

### 3. Integration Points

#### A. Workspace Context Updates
- ✅ Already has `openBrowser(url, title)` 
- ⚠️ May need to update to handle session ID (`sid`)
- ⚠️ May need to store `sid` in browserState

#### B. Page.tsx Streaming Parser
Currently handles:
- `editor_open` ✅
- `editor_update` ✅
- `image_generated` ✅
- `videos` ✅
- `images` ✅

**Missing**:
- `browser_open` ❌ - Should call `openBrowser()` with URL

#### C. Split View Component
- ✅ Already supports browser panel
- ✅ No changes needed

### 4. Environment Setup

**Required `.env.local` additions**:
```env
# Browser Service Configuration
BROWSER_SERVICE_URL=http://localhost:7071
NEXT_PUBLIC_BROWSER_SERVICE_URL=ws://localhost:7071

# Security (optional but recommended)
BROWSER_ALLOWLIST=example.com,*.example.com
```

### 5. External Service Requirements

**Browser Service** (separate process):
- Location: `/path/to/browser/services/browser`
- Port: `7071`
- Dependencies: Playwright, Chromium
- WebSocket support for streaming

## Implementation Checklist

### Phase 1: Dependencies & Environment
- [ ] Install `@browser/mcp-browser` package
- [ ] Add environment variables to `.env.local`
- [ ] Verify browser service can be started separately

### Phase 2: API Routes
- [ ] Copy/create `/api/browser/sessions/route.ts`
- [ ] Copy/create `/api/browser/navigate/route.ts`
- [ ] Copy/create `/api/browser/read/route.ts`
- [ ] Copy/create `/api/browser/input/route.ts`
- [ ] Copy/create `/api/browser/capture/route.ts`
- [ ] Copy/create `/api/browser/sessions/[sid]/route.ts`
- [ ] Test API routes proxy to browser service

### Phase 3: Component Integration
- [ ] Copy `BrowserPanel.tsx` to `components/`
- [ ] Update `BrowserPanel` imports/paths for op15 structure
- [ ] Replace `BrowserViewer` with `BrowserPanel` in `app/page.tsx`
- [ ] Update workspace context to handle session ID if needed

### Phase 4: Streaming Integration
- [ ] Add `browser_open` event handler in `app/page.tsx` SSE parser
- [ ] Ensure `openBrowser()` is called with URL from LLM
- [ ] Test browser opens from LLM tool calls

### Phase 5: Testing
- [ ] Test browser service connection
- [ ] Test session creation
- [ ] Test navigation
- [ ] Test WebSocket streaming
- [ ] Test browser panel in 50/50 split view
- [ ] Test browser opens from LLM responses

## Key Differences: Current vs. Target

| Feature | Current (BrowserViewer) | Target (BrowserPanel) |
|---------|------------------------|----------------------|
| **Architecture** | Simple iframe | Session-based with service |
| **Navigation** | Manual URL input | Programmatic via API |
| **Updates** | Static iframe | WebSocket streaming |
| **Capabilities** | View only | Read, input, capture |
| **Session Management** | None | Session-based |
| **Integration** | Direct URL | Service proxy |

## Potential Issues & Considerations

1. **Session Management**
   - Current `openBrowser()` takes URL directly
   - BrowserPanel requires session ID (`sid`)
   - May need to update workspace context to create session first

2. **Component Props**
   - Current: `BrowserViewer({ url, title, onClose })`
   - Target: `BrowserPanel({ sid, allowExecute })`
   - Need to bridge this difference

3. **State Management**
   - Current: URL stored in `browserState.url`
   - Target: Session ID may need to be stored
   - Consider storing both URL and session ID

4. **Error Handling**
   - Current: Handles iframe errors
   - Target: Need to handle service connection errors
   - Need to handle WebSocket disconnections

5. **Security**
   - Current: No domain restrictions
   - Target: Should implement `BROWSER_ALLOWLIST`
   - Consider rate limiting

6. **Performance**
   - Current: Simple iframe (low overhead)
   - Target: WebSocket connection + service (higher overhead)
   - Consider connection pooling/reuse

## Recommendations

1. **Gradual Migration**: Consider keeping `BrowserViewer` as fallback if browser service unavailable
2. **Session Lifecycle**: Implement proper session cleanup on component unmount
3. **Error Boundaries**: Add error boundaries around BrowserPanel
4. **Loading States**: Show loading state while creating session
5. **Connection Status**: Display browser service connection status
6. **Testing**: Test with browser service running and not running

## Next Steps

1. **Review Integration Guide** - Confirm source paths for BrowserPanel and API routes
2. **Locate Reference Implementation** - Find the source `apps/web` directory mentioned in guide
3. **Plan Migration Strategy** - Decide on gradual vs. complete replacement
4. **Set Up Browser Service** - Get external service running first
5. **Implement Incrementally** - Start with API routes, then component, then integration

