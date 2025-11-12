# Split-View Editor Implementation Summary

## Quick Reference

This document provides a quick overview of the split-view editor implementation plan, extracted from the operastudio14.0 reference implementation.

---

## What We're Building

A **50/50 split-view editor** that allows users to:
- View chat on the left (50%)
- Edit files on the right (50%)
- Toggle editor open/closed
- Save files directly from the editor
- Track unsaved changes

---

## Key Components from operastudio14.0

### 1. Split-View Component
**Location**: `components/layout/split-view.tsx`

**Key Implementation**:
```tsx
<div className={cn(
  "grid h-full transition-all duration-300 ease-in-out",
  isEditorOpen ? "grid-cols-[1fr_1fr]" : "grid-cols-[1fr_0fr]"
)}>
  {/* Chat Panel */}
  <div className={cn("min-w-0 overflow-hidden", isEditorOpen && "border-r border-border")}>
    {children[0]}
  </div>
  
  {/* Editor Panel */}
  <div className={cn("min-w-0 overflow-hidden transition-all duration-300", !isEditorOpen && "w-0")}>
    {isEditorOpen && children[1]}
  </div>
</div>
```

**Features**:
- CSS Grid layout (50/50 when open, 100/0 when closed)
- Smooth 300ms transitions
- Border separator when editor is open
- Controlled by `editorState.isOpen` from workspace context

---

### 2. Workspace Context
**Location**: `contexts/workspace-context.tsx`

**State Structure**:
```typescript
interface EditorState {
  filePath: string | null;
  originalContent: string;
  currentContent: string;
  isOpen: boolean;
  hasUnsavedChanges: boolean;
}
```

**Key Methods**:
- `openFile(path, content)` - Opens file in editor
- `closeEditor()` - Closes editor panel
- `updateEditorContent(content)` - Updates editor content
- `saveEditor()` - Saves file to disk

**Usage**:
```tsx
const { editorState, openFile, closeEditor, saveEditor } = useWorkspace();
```

---

### 3. Editor Component (CodeMirror)
**Location**: `components/editor/codemirror-editor.tsx`

**Features**:
- Syntax highlighting (JavaScript, TypeScript, JSON, Markdown, Python, etc.)
- File path display in header
- Unsaved changes indicator
- Save button
- Content sync with workspace context

**Dependencies Needed**:
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

---

## Current Project State (op15)

### ✅ Already Exists
- Sidebar layout (`app/layout.tsx`)
- File tree component (`components/filesystem/file-tree.tsx`)
- Filesystem list API (`app/api/filesystem/list/route.ts`)
- Chat interface (`app/page.tsx`)

### ❌ Missing (Need to Create)
- Workspace context (`contexts/workspace-context.tsx`)
- Split-view component (`components/layout/split-view.tsx`)
- Editor component (`components/editor/codemirror-editor.tsx`)
- File read API (`app/api/filesystem/read/route.ts`)
- File write API (`app/api/filesystem/write/route.ts`)

---

## Implementation Order

### Step 1: Workspace Context (Foundation)
Create `contexts/workspace-context.tsx` first - everything else depends on it.

### Step 2: File APIs
Create read/write APIs so editor can load and save files.

### Step 3: Split-View Component
Create the layout component that manages the 50/50 split.

### Step 4: Editor Component
Create CodeMirror editor with syntax highlighting and save functionality.

### Step 5: Integration
Wire everything together in `app/page.tsx` and `app/layout.tsx`.

### Step 6: File Tree Integration (Optional)
Add click handlers to file tree to open files in editor.

---

## Quick Start Checklist

- [ ] Install CodeMirror dependencies
- [ ] Create `contexts/workspace-context.tsx`
- [ ] Create `app/api/filesystem/read/route.ts`
- [ ] Create `app/api/filesystem/write/route.ts`
- [ ] Create `components/layout/split-view.tsx`
- [ ] Create `components/editor/codemirror-editor.tsx`
- [ ] Update `app/layout.tsx` to include `WorkspaceProvider`
- [ ] Update `app/page.tsx` to use `SplitView`
- [ ] Test file open/save functionality

---

## Design Specifications

### Layout
- **Split**: 50/50 when editor open (`grid-cols-[1fr_1fr]`)
- **Full-width**: Chat only when editor closed (`grid-cols-[1fr_0fr]`)
- **Transition**: 300ms ease-in-out
- **Border**: Right border on chat panel when editor open

### Editor Header
- **Height**: ~48px
- **Background**: Matte grey (`oklch(0.15 0 0)`)
- **Content**: File name, unsaved indicator (•), save button

### Colors
- **Background**: `oklch(0.08 0 0)` - Deep matte black
- **Sidebar**: `oklch(0.15 0 0)` - Matte grey
- **Border**: `oklch(0.25 0 0)` - Subtle border

---

## Reference Files

From `/home/dp/Desktop/operastudio14.0`:
- `components/layout/split-view.tsx` - Split-view implementation
- `contexts/workspace-context.tsx` - State management
- `components/editor/codemirror-editor.tsx` - Editor component
- `app/page.tsx` - Usage example
- `app/layout.tsx` - Provider setup

---

## Estimated Time

- **Setup & Context**: 1-2 hours
- **APIs**: 1-2 hours
- **Components**: 4-5 hours
- **Integration**: 1-2 hours
- **Testing & Polish**: 2-3 hours

**Total: 10-15 hours**

---

## Next Steps

1. Review `SPLIT_VIEW_IMPLEMENTATION_PLAN.md` for detailed implementation steps
2. Start with workspace context (foundation)
3. Build APIs (file read/write)
4. Create components (split-view, editor)
5. Integrate everything together
6. Test and polish

