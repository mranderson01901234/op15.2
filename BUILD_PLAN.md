Optimized Build Plan: Minimal LLM Assistant with Modern UI

Overview
Develop a local-environment LLM assistant featuring a modern, Vercel-style Firebase UI. The UI will have a matte grey sidebar and a matte black background.

Architecture
The assistant will be built around four core commands:
- fs.list: List files and directories.
- fs.move: Move or rename files/directories.
- exec.run: Execute shell commands and stream output.
- index.scan: Build an in-memory index for fuzzy path lookups.

UI Design Principles
- Modern Next.js application with sidebar navigation.
- Dark theme using oklch colors.
- Streaming chat interface.
- Matte grey sidebar (oklch(0.15 0 0)) with subtle borders.
- Matte black background (oklch(0.08 0 0)) for main content.
- Vercel-style accents (oklch(0.65 0.15 250) for primary actions).
- No shadows, no gradients, minimal borders for a clean, matte finish.
- System monospace font, 14px base size, 1.5 line height.
- Consistent spacing (8px grid).

Development Phases

Phase 1: Project Setup
- Initialize Next.js project (TypeScript, Tailwind CSS, App Router).
- Install core dependencies: @google/genai, shadcn/ui, other UI libraries.
- Define file structure: app, components, lib, server, scripts, tests.

Phase 2: UI Theme and Design System
- Implement oklch matte grey/black color palette in globals.css.
- Develop matte grey sidebar component (16rem expanded, 3rem collapsed).
- Set up main content area with deep matte black background.

Phase 3: Core LLM Integration
- Create Gemini function registry in lib/llm/gemini.ts for the four tools.
- Define a concise system prompt for the LLM.
- Build streaming chat API route (/app/api/chat/route.ts) for text deltas and tool events.

Phase 4: Tool Implementations
- Implement fs.list and fs.move in lib/tools/fs.ts.
- Implement exec.run in lib/tools/exec.ts (timeout handling, working directory).
- Implement index.scan in lib/tools/index.ts (filesystem walk, in-memory storage, fuzzy lookup).

Phase 5: UI Components
- Develop chat interface (/components/chat/chat-interface.tsx) with Vercel-style input, send button, streaming output.
- Build sidebar navigation (/components/layout/app-sidebar.tsx) with logo, navigation, collapse/expand toggle.
- Create main layout (/app/layout.tsx) with sidebar and content area.

Phase 6: Streaming Implementation
- Implement Server-Sent Events (SSE) using Next.js streaming API (type and content formatting).
- Develop client-side streaming to parse SSE events and update UI incrementally.

Phase 7: Testing and Validation
- Write unit tests for all tools (fs.list, fs.move, exec.run, index.scan).
- Perform manual acceptance tests for end-to-end functionality and UI adherence.

Phase 8: Polish and Optimization
- Optimize performance (lazy loading, streaming chunk optimization).
- Enhance UX (loading states, error messages, keyboard shortcuts).
- Refine visuals (smooth transitions, consistent spacing, accessible contrast).

Environment Variables
- GEMINI_API_KEY=your_key_here
- WORKSPACE_ROOT=/home/user (optional, defaults to process.cwd())

Development Script
- 'dev.sh' script to run 'pnpm dev'.

Acceptance Criteria
- All four commands function end-to-end with streamed output.
- UI matches matte grey sidebar and matte black background design.
- Vercel-style clean, minimal design achieved.
- Streaming functions smoothly.
- All tests pass, and manual acceptance steps are complete.

Timeline Estimate
Total: 12-18 hours for a complete, polished implementation.