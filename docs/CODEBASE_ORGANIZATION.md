# Codebase Organization Strategy

## Problem Statement

The codebase has grown complex with:
- Duplicate code (desktop/mobile textareas)
- Scattered focus logic (33 references to `forceFocusTextarea`)
- Unclear context (hard to know what's being worked on)
- Mobile/desktop conditional rendering causing conflicts
- Single massive file (`app/page.tsx` is 5400+ lines)

## Core Principles

### 1. **Single Source of Truth**
- One component per feature, not duplicates
- Shared logic extracted to hooks/utilities
- Clear separation: desktop vs mobile handled at layout level, not component level

### 2. **Explicit Context**
- Every major file has a header comment explaining its purpose
- Component files document their viewport requirements
- Hooks document their dependencies and side effects

### 3. **Modular Architecture**
- Break down `app/page.tsx` into logical components
- Extract focus logic to a dedicated hook
- Separate mobile/desktop concerns at the layout level

## File Organization

### Current Structure Issues
```
app/page.tsx (5400+ lines) ❌
├── Desktop chat UI
├── Mobile chat UI  
├── Focus logic (scattered)
├── Message rendering
├── Tool execution display
└── Everything else
```

### Proposed Structure
```
app/page.tsx (orchestration only, ~200 lines)
├── Imports
├── State management
└── Layout composition

components/chat/
├── chat-container.tsx (desktop + mobile wrapper)
├── chat-messages.tsx (shared message rendering)
├── chat-input.tsx (SINGLE textarea component)
└── chat-input-focus.tsx (focus hook)

hooks/
├── use-chat-input-focus.ts (ALL focus logic)
└── use-mobile.ts (existing)
```

## Focus Logic Consolidation

### Current Problem
- Focus logic in 5+ different places
- Desktop and mobile textareas share same ref
- Multiple competing focus handlers

### Solution: Single Focus Hook
```typescript
// hooks/use-chat-input-focus.ts
export function useChatInputFocus(textareaRef: RefObject<HTMLTextAreaElement>) {
  // ALL focus logic here
  // Handles: page load, new chat, chat switch, message send
  // Returns: { focus, isFocused }
}
```

### Usage Pattern
```typescript
// components/chat/chat-input.tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
const { focus } = useChatInputFocus(textareaRef);

// Focus when needed
useEffect(() => {
  if (activeChatId) focus();
}, [activeChatId, focus]);
```

## Mobile/Desktop Pattern

### Current Problem
- Two separate textarea components
- Conditional rendering causes ref issues
- Focus doesn't know which one is active

### Solution: Single Component, Responsive Styling
```typescript
// components/chat/chat-input.tsx
export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { focus } = useChatInputFocus(textareaRef);
  const isMobile = useIsMobile();
  
  // ONE textarea, responsive classes
  return (
    <Textarea
      ref={textareaRef}
      className={cn(
        "base-styles",
        isMobile ? "mobile-styles" : "desktop-styles"
      )}
    />
  );
}
```

## Context Documentation Standards

### File Headers
Every major file should start with:
```typescript
/**
 * ChatInput Component
 * 
 * Purpose: Single textarea input for chat messages
 * Viewport: Works on both desktop and mobile (responsive)
 * Dependencies: useChatInputFocus hook
 * 
 * Key Features:
 * - Auto-focus on mount and chat changes
 * - Mobile-safe keyboard handling
 * - PDF attachment support
 */
```

### Component Props Documentation
```typescript
interface ChatInputProps {
  /** Current chat ID - triggers focus when changed */
  activeChatId: string | null;
  /** Callback when message is sent */
  onSend: (message: string) => void;
}
```

## Workflow Improvements

### 1. Context File
Create `.cursor-context.md` in root:
```markdown
# Current Work Context

## Active View
- Desktop view (default)
- Mobile view (when testing)

## Current Focus
- Chat input focus behavior
- Mobile/desktop alignment

## Known Issues
- Focus not working on new chat creation
- Mobile textarea ref conflicts

## Recent Changes
- [Date] Added mobile view support
- [Date] Attempted focus fixes (not working)
```

### 2. Component Status Tracking
Add to each component file:
```typescript
// STATUS: ✅ Stable | 🚧 In Progress | ⚠️ Needs Refactor
// LAST UPDATED: 2024-01-15
// MOBILE TESTED: Yes/No
// DESKTOP TESTED: Yes/No
```

### 3. Refactoring Checklist
When working on a feature:
- [ ] Check if mobile/desktop both work
- [ ] Verify focus behavior
- [ ] Test on actual mobile device
- [ ] Update context file
- [ ] Document any new patterns

## Immediate Action Items

### Phase 1: Extract Focus Logic (High Priority)
1. Create `hooks/use-chat-input-focus.ts`
2. Move ALL focus logic there
3. Update components to use the hook
4. Remove duplicate focus handlers

### Phase 2: Consolidate Textarea (High Priority)
1. Create `components/chat/chat-input.tsx`
2. Single textarea component (responsive)
3. Remove duplicate desktop/mobile textareas
4. Update refs to use single component

### Phase 3: Break Down page.tsx (Medium Priority)
1. Extract message rendering → `components/chat/chat-messages.tsx`
2. Extract tool display → `components/chat/tool-execution.tsx`
3. Keep page.tsx as orchestration only

### Phase 4: Documentation (Ongoing)
1. Add file headers to all major files
2. Document mobile/desktop patterns
3. Create component dependency graph
4. Update `.cursor-context.md` regularly

## Code Review Checklist

Before committing:
- [ ] Works on desktop view
- [ ] Works on mobile view  
- [ ] Focus behavior correct
- [ ] No duplicate code
- [ ] Context file updated
- [ ] File headers added/updated

## Communication Patterns

### When Requesting Changes
Instead of: "fix the focus"
Say: "Fix focus in ChatInput component - not working when clicking New Chat button"

### When Making Changes
Always mention:
- Which view (desktop/mobile/both)
- Which component/file
- What the expected behavior is

### Context File Updates
Update `.cursor-context.md` when:
- Starting new feature
- Fixing bugs
- Changing architecture
- Testing on different viewports

## Anti-Patterns to Avoid

❌ **Don't**: Create separate desktop/mobile components for same feature
✅ **Do**: Use responsive styling in single component

❌ **Don't**: Scatter related logic across multiple files
✅ **Do**: Group related logic in hooks/utilities

❌ **Don't**: Use same ref for multiple DOM elements
✅ **Do**: One ref per component instance

❌ **Don't**: Add focus logic in multiple places
✅ **Do**: Centralize in one hook

## Success Metrics

- `app/page.tsx` under 1000 lines
- Focus logic in one place
- Single textarea component
- All components documented
- Context file always up to date
- No duplicate code patterns

