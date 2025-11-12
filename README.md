# LLM Assistant - Production-Ready Foundation

A robust and minimal LLM assistant, engineered for production environments. This project leverages the Next.js App Router and Gemini 2.5 Flash, providing a solid foundation for scalable AI applications.

## Key Features

- Essential Toolset:
  - fs.list: Easily list files and directories.
  - fs.move: Move or rename files and directories with precision.
  - exec.run: Execute shell commands directly from the assistant.
  - index.scan: Build a comprehensive filesystem index for rapid, fuzzy lookups.

- Production-Grade Architecture:
  - Clean, scalable abstractions (interfaces) for future expansion.
  - End-to-end type safety with TypeScript strict mode.
  - Robust structured logging and error handling.
  - Flexible user context structure, ready for seamless authentication integration.

- Modern User Interface:
  - A sleek matte grey sidebar paired with a matte black background.
  - Inspired by Vercel's elegant design principles.
  - Real-time streaming chat interface for dynamic interactions.

## Getting Started

### Prerequisites

- Node.js 20+ installed
- pnpm package manager (install with `npm install -g pnpm`)
- A Clerk account for authentication (sign up here: https://dashboard.clerk.com)
- A Google Gemini API key (get one here: https://aistudio.google.com/app/apikey)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd op15
   ```

2. Install Dependencies:
   ```bash
   pnpm install
   ```

3. Configure Environment Variables:
   ```bash
   cp .env.example .env.local
   ```
   
   Then edit `.env.local` and add your API keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Get from Clerk Dashboard (https://dashboard.clerk.com)
   - `CLERK_SECRET_KEY` - Get from Clerk Dashboard (https://dashboard.clerk.com)
   - `GEMINI_API_KEY` - Get from Google AI Studio (https://aistudio.google.com/app/apikey)

4. Verify Environment Setup:
   ```bash
   node scripts/check-env.js
   ```

5. Start Development Server:
   
   Option 1: Using the startup script (Recommended)
   ```bash
   ./start.sh
   ```
   
   Option 2: Using pnpm directly
   ```bash
   pnpm dev
   ```
   
   The startup script (`start.sh`) automatically:
   - Checks for required dependencies (pnpm, node_modules)
   - Frees the port if it's already in use
   - Starts the server with proper configuration
   - Provides colored output and status messages

6. Stop the Server:
   ```bash
   ./stop.sh
   ```
   Or press `Ctrl+C` if running in the foreground

7. Access the Application:
   Open your browser and navigate to `http://localhost:3000`.

## Environment Configuration

### Required Variables

- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (Required): Your Clerk publishable key for authentication
- CLERK_SECRET_KEY (Required): Your Clerk secret key for authentication
- GEMINI_API_KEY (Required): Your Google Gemini API key for chat functionality

### Optional Variables

- BRAVE_API_KEY (Optional): Integrate Brave Search for enhanced web search capabilities
- WORKSPACE_ROOT (Optional): Define the root directory for file operations (defaults to the current working directory)
- NEXT_PUBLIC_APP_URL (Optional): Set your production URL for workspace sync (defaults to `http://localhost:3000`)
- PORT (Optional): Server port (defaults to 3000)
- HOSTNAME (Optional): Server hostname (defaults to localhost)

See `.env.example` for a complete list of all available environment variables.

## Architectural Excellence

### Flexible Abstractions for Scalability

Our design prioritizes flexibility, allowing you to easily swap implementations as your project grows:

- FileSystem: Transition from 'LocalFileSystem' to 'VirtualFileSystem' (e.g., S3) with minimal effort.
- Index: Upgrade from 'MemoryIndex' to a 'DatabaseIndex' (e.g., PostgreSQL) while maintaining the same interface.
- ToolExecutor: Evolve from 'SimpleToolExecutor' to a 'SandboxedToolExecutor' (e.g., Docker) for enhanced security and isolation.

### Authentication

This project uses Clerk (https://clerk.com) for authentication. All API routes require authentication, and the UI includes sign-in/sign-up functionality. Configure your Clerk application in the Clerk Dashboard (https://dashboard.clerk.com) and add your keys to `.env.local`.

### Seamless User Context Management

User context is automatically extracted from Clerk authentication tokens. The system supports multi-tenant isolation with user-specific workspaces and file operations.

## Testing and Quality Assurance

```bash
# Type Check
pnpm run type-check

# Linting
pnpm run lint

# Build Project
pnpm run build
```

## Scalability Hooks - Ready for Growth

When your project is ready to scale, these hooks provide a clear path forward:

1. Authentication: Integrate your preferred auth solution by modifying 'getDefaultUserContext()'.
2. Database Integration: Replace 'MemoryIndex' with a 'DatabaseIndex' for persistent storage.
3. Virtual File System: Switch to a 'VirtualFileSystem' for cloud-based file management.
4. Sandboxed Execution: Implement a 'SandboxedToolExecutor' for secure and isolated tool execution.

No extensive rewrites needed – just swap implementations and scale!

## Project Structure Overview

```
/app
  /api/chat/route.ts    # The streaming chat API endpoint
  /page.tsx             # The main user interface component
/lib
  /llm/gemini.ts        # Gemini client and streaming logic
  /tools/               # Handlers for various tools
  /storage/             # FileSystem abstraction layer
  /index/               # Indexing abstraction layer
  /types/               # Custom type definitions
  /utils/               # General utilities (logger, error handling, environment variables)
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Development

### Available Scripts

- `./start.sh` - Start development server with WebSocket support (recommended)
- `./stop.sh` - Stop the development server
- `pnpm dev` - Start development server with WebSocket support (alternative)
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm type-check` - Run TypeScript type checking
- `pnpm test` - Run tests

### Project Structure

```
/app
  /api/              # API routes (chat, filesystem, workspace, etc.)
  /page.tsx          # Main UI component
/lib
  /llm/              # Gemini client and streaming logic
  /tools/            # Tool handlers (fs, exec, index, etc.)
  /storage/          # FileSystem abstraction layer
  /index/            # Indexing abstraction layer
  /types/            # TypeScript type definitions
  /utils/            # Utilities (logger, errors, env)
/components          # React components
/contexts           # React context providers
/docs               # Documentation files
```

## Security

⚠️ Important Security Notes:

- This application executes shell commands and performs file operations. Use with caution in production.
- Path traversal protection should be implemented before production use (see `LAUNCH_AUDIT.md`).
- Command execution is not sandboxed - consider implementing Docker-based sandboxing for production.
- Rate limiting is not currently implemented - consider adding before production use.

See `LAUNCH_AUDIT.md` and `30K_FOOT_LAUNCH_BLUEPRINT.md` for detailed security and architecture information.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.