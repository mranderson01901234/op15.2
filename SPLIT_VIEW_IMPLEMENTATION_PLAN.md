# Split-View Editor Implementation Plan

## Overview
Implement a 50/50 split-view editor system based on `/home/dp/Desktop/operastudio14.0`, allowing users to view and edit files alongside the chat interface.

## Key Components from operastudio14.0

### 1. Split-View Component (`components/layout/split-view.tsx`)
- **Purpose**: Manages the 50/50 layout between chat and editor
- **Key Features**:
  - CSS Grid-based layout (`grid-cols-[1fr_1fr]` when open, `grid-cols-[1fr_0fr]` when closed)
  - Smooth transitions (300ms ease-in-out)
  - Border separator between panels
  - Controlled by `editorState.isOpen` from workspace context

### 2. Workspace Context (`contexts/workspace-context.tsx`)
- **Purpose**: Centralized state management for editor and workspace
- **Key State**:
  - `editorState`: `{ filePath, originalContent, currentContent, isOpen, hasUnsavedChanges }`
  - `selectedPath`: Currently selected file/directory
  - `acceptedEdits` / `rejectedEdits`: Edit tracking for animations
- **Key Methods**:
  - `openFile(path, content)`: Opens file in editor
  - `closeEditor()`: Closes editor panel
  - `updateEditorContent(content)`: Updates editor content
  - `saveEditor()`: Saves file to disk
  - `streamEditsToEditor()`: Handles edit animations

### 3. Editor Component Options
- **CodeMirror Editor** (`components/editor/codemirror-editor.tsx`): Lightweight, performant
- **Monaco Editor** (`components/editor/monaco-editor.tsx`): VS Code-like experience
- Both support:
  - Syntax highlighting
  - Edit tracking and animations
  - Unsaved changes indicators
  - File save functionality

---

## Implementation Plan

### Phase 1: Workspace Context Setup

#### 1.1 Create Workspace Context
**File**: `contexts/workspace-context.tsx`

**Features**:
- Editor state management (`filePath`, `originalContent`, `currentContent`, `isOpen`, `hasUnsavedChanges`)
- File selection state (`selectedPath`, `selectedPathType`)
- Editor operations (`openFile`, `closeEditor`, `updateEditorContent`, `saveEditor`)
- Edit tracking (for future animation features)

**Dependencies**:
- React Context API
- State management hooks (`useState`, `useCallback`)

**Implementation Steps**:
1. Create `WorkspaceContext` with TypeScript interfaces
2. Implement `WorkspaceProvider` component
3. Create `useWorkspace` hook for consuming context
4. Add editor state management functions
5. Add file save functionality (API integration)

---

### Phase 2: Split-View Component

#### 2.1 Create Split-View Component
**File**: `components/layout/split-view.tsx`

**Features**:
- 50/50 grid layout when editor is open
- Full-width chat when editor is closed
- Smooth CSS transitions
- Border separator between panels
- Responsive to `editorState.isOpen`

**Implementation Details**:
```typescript
// Grid layout: 50/50 when open, 100/0 when closed
className={cn(
  "grid h-full transition-all duration-300 ease-in-out",
  isEditorOpen ? "grid-cols-[1fr_1fr]" : "grid-cols-[1fr_0fr]"
)}
```

**Dependencies**:
- `useWorkspace` hook
- `cn` utility for className merging
- Tailwind CSS classes

---

### Phase 3: Editor Component

#### 3.1 Choose Editor Library
**Options**:
- **CodeMirror 6**: Lightweight (~200KB), fast, extensible
- **Monaco Editor**: VS Code editor (~2MB), feature-rich

**Recommendation**: Start with CodeMirror 6 for better performance and smaller bundle size.

#### 3.2 Create CodeMirror Editor Component
**File**: `components/editor/codemirror-editor.tsx`

**Features**:
- File path display in header
- Unsaved changes indicator
- Save button (disabled when no changes)
- Syntax highlighting based on file extension
- Content synchronization with workspace context
- Edit tracking for animations (future enhancement)

**Dependencies**:
- `@codemirror/view`
- `@codemirror/state`
- `@codemirror/lang-*` (for syntax highlighting)
- `useWorkspace` hook

**Implementation Steps**:
1. Set up CodeMirror editor instance
2. Configure syntax highlighting
3. Wire up content updates to workspace context
4. Implement save functionality
5. Add unsaved changes tracking
6. Style header and controls

---

### Phase 4: API Integration

#### 4.1 File Read API
**File**: `app/api/filesystem/read/route.ts` (may already exist)

**Purpose**: Read file content for editor

**Endpoint**: `GET /api/filesystem/read?path=<encoded-path>`

**Response**:
```json
{
  "content": "file content...",
  "path": "/path/to/file"
}
```

#### 4.2 File Write API
**File**: `app/api/filesystem/write/route.ts` (new)

**Purpose**: Save editor content to disk

**Endpoint**: `POST /api/filesystem/write`

**Request Body**:
```json
{
  "path": "/path/to/file",
  "content": "file content..."
}
```

**Response**:
```json
{
  "success": true,
  "path": "/path/to/file"
}
```

**Implementation Steps**:
1. Create write route handler
2. Validate path and content
3. Write file to filesystem
4. Return success/error response
5. Add error handling

---

### Phase 5: Integration with Chat Interface

#### 5.1 Update Chat Interface
**File**: `app/page.tsx` or `components/chat/chat-interface.tsx`

**Changes Needed**:
- Wrap chat interface in `SplitView` component
- Add editor component as second child
- Ensure proper layout structure

**Layout Structure**:
```tsx
<SplitView>
  <ChatInterface />
  <CodeMirrorEditor />
</SplitView>
```

#### 5.2 Update Layout
**File**: `app/layout.tsx`

**Changes Needed**:
- Wrap app with `WorkspaceProvider`
- Ensure proper height constraints for split-view

**Structure**:
```tsx
<WorkspaceProvider>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset className="flex flex-col h-screen">
      {children} {/* Contains SplitView */}
    </SidebarInset>
  </SidebarProvider>
</WorkspaceProvider>
```

---

### Phase 6: File Opening Integration

#### 6.1 File Tree Integration (Optional)
If file tree exists, add click handlers to open files in editor:

**File**: `components/filesystem/file-tree.tsx`

**Changes**:
- On file click, call `openFile(path, content)`
- Fetch file content via API
- Update workspace context

#### 6.2 Chat Integration (Optional)
Allow LLM to open files in editor via tool calls or direct commands:

**Implementation**:
- Add `openFile` tool or command
- When LLM suggests opening a file, trigger `openFile()`
- Display file in editor panel

---

## File Structure

```
op15/
├── contexts/
│   └── workspace-context.tsx          # NEW: Workspace state management
├── components/
│   ├── layout/
│   │   └── split-view.tsx             # NEW: Split-view component
│   └── editor/
│       └── codemirror-editor.tsx      # NEW: CodeMirror editor
├── app/
│   ├── api/
│   │   └── filesystem/
│   │       └── write/
│   │           └── route.ts          # NEW: File write API
│   ├── layout.tsx                     # UPDATE: Add WorkspaceProvider
│   └── page.tsx                       # UPDATE: Add SplitView wrapper
└── package.json                       # UPDATE: Add CodeMirror dependencies
```

---

## Dependencies

### New Dependencies
```json
{
  "@codemirror/view": "^6.0.0",
  "@codemirror/state": "^6.0.0",
  "@codemirror/lang-javascript": "^6.0.0",
  "@codemirror/lang-typescript": "^6.0.0",
  "@codemirror/lang-json": "^6.0.0",
  "@codemirror/lang-markdown": "^6.0.0",
  "@codemirror/lang-python": "^6.0.0",
  "@codemirror/theme-one-dark": "^6.0.0"
}
```

### Existing Dependencies (Verify)
- `react` (^19.2.0)
- `react-dom` (^19.2.0)
- `lucide-react` (for icons)
- `clsx` / `tailwind-merge` (for className utilities)

---

## Implementation Checklist

### Setup
- [ ] Install CodeMirror dependencies
- [ ] Create `contexts/workspace-context.tsx`
- [ ] Create `components/layout/split-view.tsx`
- [ ] Create `components/editor/codemirror-editor.tsx`

### API
- [ ] Create `app/api/filesystem/write/route.ts`
- [ ] Verify `app/api/filesystem/read/route.ts` exists (or create it)

### Integration
- [ ] Update `app/layout.tsx` to include `WorkspaceProvider`
- [ ] Update `app/page.tsx` to use `SplitView` component
- [ ] Wire up editor to workspace context
- [ ] Test file open/close functionality
- [ ] Test file save functionality

### Polish
- [ ] Add unsaved changes warning
- [ ] Style editor header and controls
- [ ] Add keyboard shortcuts (Ctrl+S to save)
- [ ] Add file path display
- [ ] Test syntax highlighting for common file types

### Optional Enhancements
- [ ] Add file tree integration (open files on click)
- [ ] Add LLM tool to open files
- [ ] Add edit animations (like operastudio14.0)
- [ ] Add multiple file tabs
- [ ] Add file search within editor

---

## Design Specifications

### Split-View Layout
- **Grid Layout**: CSS Grid with `grid-cols-[1fr_1fr]` (50/50 split)
- **Transition**: `duration-300 ease-in-out` for smooth animations
- **Border**: `border-r border-border` between panels
- **Height**: Full height (`h-full`)

### Editor Header
- **Height**: ~48px
- **Background**: Matte grey (`oklch(0.15 0 0)`)
- **Border**: Bottom border (`border-b border-border`)
- **Content**: File name, unsaved indicator, save button

### Editor Panel
- **Background**: Matte black (`oklch(0.08 0 0)`)
- **Font**: Monospace (JetBrains Mono or system default)
- **Padding**: Minimal padding for code editing

### Colors (from BUILD_PLAN.md)
- **Background**: `oklch(0.08 0 0)` - Deep matte black
- **Sidebar**: `oklch(0.15 0 0)` - Matte grey
- **Border**: `oklch(0.25 0 0)` - Subtle border
- **Foreground**: `oklch(0.95 0 0)` - Near-white text

---

## Testing Plan

### Unit Tests
- [ ] Workspace context state management
- [ ] Split-view component rendering
- [ ] Editor content updates

### Integration Tests
- [ ] File open → editor displays content
- [ ] File edit → unsaved changes indicator appears
- [ ] File save → changes persist, indicator clears
- [ ] Editor close → split-view collapses
- [ ] Editor open → split-view expands to 50/50

### Manual Tests
1. Open a file → verify editor appears on right
2. Edit file → verify unsaved indicator appears
3. Save file → verify indicator clears
4. Close editor → verify chat expands to full width
5. Reopen editor → verify 50/50 split returns

---

## Timeline Estimate

- **Phase 1** (Workspace Context): 1-2 hours
- **Phase 2** (Split-View Component): 1 hour
- **Phase 3** (Editor Component): 3-4 hours
- **Phase 4** (API Integration): 1-2 hours
- **Phase 5** (Chat Integration): 1 hour
- **Phase 6** (File Opening): 1-2 hours (optional)
- **Testing & Polish**: 2-3 hours

**Total: 10-15 hours** for complete implementation with polish.

---

## Reference Implementation

Key files from `/home/dp/Desktop/operastudio14.0`:
- `components/layout/split-view.tsx` - Split-view component
- `contexts/workspace-context.tsx` - Workspace state management
- `components/editor/codemirror-editor.tsx` - CodeMirror implementation
- `app/page.tsx` - Usage example
- `app/layout.tsx` - Provider setup

---

## Notes

- Start with CodeMirror 6 for better performance
- Keep editor state in workspace context for easy access
- Use CSS Grid for reliable 50/50 split
- Add smooth transitions for better UX
- Consider adding keyboard shortcuts for power users
- Future: Add edit animations like operastudio14.0

