# Application Description

## Overview

**OP15** is a production-ready LLM assistant built on Next.js 16 with Google Gemini 2.5 Flash, designed as a comprehensive AI-powered workspace. The application combines conversational AI with practical tools for file management, code execution, web browsing, and image generation, all accessible through an intuitive chat interface.

## Core Features

### AI-Powered Chat Interface
- **Streaming Responses**: Real-time streaming chat powered by Google Gemini 2.5 Flash
- **Multi-modal Support**: Handles text, images, PDFs, and structured data
- **Context-Aware**: Maintains conversation history and workspace context
- **Tool Integration**: Seamlessly integrates multiple tools through function calling

### File System Operations
- **File Management**: List, read, write, move, and create files and directories
- **Fuzzy Search**: Fast in-memory indexing for quick file lookups
- **Local Environment Bridge**: Connect local filesystem via browser File System Access API (no installation required)
- **Workspace Sync**: Automatic workspace synchronization for command execution

### Code & Development Tools
- **Code Editor**: Integrated CodeMirror editor with syntax highlighting for multiple languages
- **Command Execution**: Execute shell commands with streaming output
- **Split View**: 50/50 split-screen layout for simultaneous chat and code editing

### Web Integration
- **Web Search**: Brave Search API integration for up-to-date information
- **Browser Panel**: Built-in browser viewer with session-based navigation (optional browser service) or iframe fallback
- **URL Navigation**: LLM can open and navigate websites directly

### PDF Processing
- **Multi-page Support**: Process PDFs up to 1000 pages
- **Vision Analysis**: Extract text, images, tables, charts, and diagrams
- **Batch Processing**: Handle multiple PDFs in a single conversation
- **Structured Extraction**: Export data as JSON or CSV

## Imagen 4 Integration

### Overview

The application features seamless integration with **Google Imagen 4.0**, Google's advanced text-to-image generation model. This integration allows users to generate high-quality images directly through natural language conversations.

### Key Features

**1. Natural Language Image Generation**
- Users can request image generation through simple prompts like "create a sunset over mountains" or "generate a logo for my company"
- The LLM automatically recognizes image generation requests and calls the `imagen.generate` tool
- No need for technical knowledge or API calls - just describe what you want

**2. Advanced Configuration Options**
- **Aspect Ratios**: Support for multiple aspect ratios (1:1, 9:16, 16:9, 4:3, 3:4)
- **Image Sizes**: Generate images in 1K or 2K resolution
- **Output Formats**: JPEG or PNG output options
- **Batch Generation**: Generate up to 4 images per request
- **Person Generation**: Configurable person generation settings

**3. Seamless User Experience**
- **Automatic Display**: Generated images automatically appear in the dedicated image viewer panel
- **Integrated Viewer**: Built-in image viewer with zoom, pan, download, copy, and share capabilities
- **Clean Interface**: Image generation messages are automatically filtered from chat content for a cleaner conversation flow
- **Instant Feedback**: Users receive immediate visual confirmation when images are generated

**4. Technical Implementation**
- **API Integration**: Direct integration with Google's Imagen 4.0 API via `@google/genai` SDK
- **Tool-Based Architecture**: Implemented as a function-calling tool (`imagen.generate`) that the LLM can invoke automatically
- **Base64 Encoding**: Images are returned as base64-encoded data URLs for instant display
- **Error Handling**: Comprehensive error handling with user-friendly error messages
- **Authentication**: Secure API access using Gemini API key (same key used for chat)

### Usage Flow

1. **User Request**: User types a natural language request like "create a logo for a tech startup"
2. **LLM Recognition**: Gemini recognizes the image generation intent
3. **Tool Invocation**: LLM automatically calls `imagen.generate` with appropriate parameters
4. **Image Generation**: Request sent to Imagen 4.0 API with optimized settings
5. **Display**: Generated image(s) automatically displayed in the right-side image viewer panel
6. **User Interaction**: User can zoom, pan, download, copy, or share the image

### Example Use Cases

- **Creative Projects**: Generate illustrations, logos, concept art, or visual designs
- **Content Creation**: Create images for blog posts, social media, or presentations
- **Prototyping**: Quickly visualize ideas and concepts
- **Educational**: Generate visual aids or examples for learning materials
- **Marketing**: Create promotional images or product mockups

### API Endpoints

- **POST `/api/imagen/generate`**: Direct API endpoint for image generation
  - Accepts: `prompt`, `numberOfImages`, `aspectRatio`, `imageSize`, `outputMimeType`
  - Returns: Array of base64-encoded images with metadata
  - Requires: Clerk authentication

### Configuration

The Imagen 4 integration uses the same `GEMINI_API_KEY` environment variable as the chat functionality, making setup straightforward. No additional API keys or services are required.

## Architecture Highlights

- **Type-Safe**: Full TypeScript with strict mode
- **Scalable**: Clean abstractions allow easy swapping of implementations
- **Production-Ready**: Comprehensive error handling, logging, and authentication
- **Modern Stack**: Next.js 16 App Router, React 19, Tailwind CSS
- **Real-time**: WebSocket support for browser bridge and live updates

## Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **AI**: Google Gemini 2.5 Flash, Google Imagen 4.0
- **Authentication**: Clerk
- **Storage**: File System Access API (local), in-memory indexing
- **Real-time**: WebSocket (ws library)

## Security

- All API routes require Clerk authentication
- User-specific workspace isolation
- Secure API key management via environment variables
- Path traversal protection considerations documented

---

*This application demonstrates a production-ready approach to building AI-powered tools with seamless multimodal capabilities, combining conversational AI, file management, code execution, and image generation in a unified interface.*

