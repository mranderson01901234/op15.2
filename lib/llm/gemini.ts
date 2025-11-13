import { GoogleGenAI, Type } from "@google/genai";
import type { GenerateContentConfig, FunctionDeclaration } from "@google/genai";
import type { Message, StreamChunk } from "./types";
import { getChatEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = "gemini-2.5-flash";

/**
 * Function registry for Gemini
 * Defines the four core tools
 */
export const FUNCTION_REGISTRY: FunctionDeclaration[] = [
  {
    name: "fs.list",
    description: "List files and folders at a path. Returns names, types, sizes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Absolute or relative path",
        },
        depth: {
          type: Type.INTEGER,
          description: "0=current dir only",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fs.move",
    description: "Move or rename a file or directory.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        source: { type: Type.STRING },
        destination: { type: Type.STRING },
        createDestDirs: { type: Type.BOOLEAN },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "exec.run",
    description: "Execute a shell command in cwd and stream stdout/stderr.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: "e.g., 'ls -la' or 'git status'",
        },
        cwd: {
          type: Type.STRING,
          description: "Working directory",
        },
        timeoutMs: { type: Type.INTEGER },
      },
      required: ["command"],
    },
  },
  {
    name: "index.scan",
    description: "Walk the filesystem from a root and cache a path index for fuzzy finds. Set enableRAG=true to upload files to File Search stores for semantic search (RAG is opt-in, disabled by default).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        root: { 
          type: Type.STRING,
          description: "Root directory to scan"
        },
        maxDepth: { 
          type: Type.INTEGER,
          description: "Maximum depth to scan (default: 4)"
        },
        followSymlinks: { 
          type: Type.BOOLEAN,
          description: "Whether to follow symbolic links (default: false)"
        },
        enableRAG: {
          type: Type.BOOLEAN,
          description: "Upload files to File Search store for semantic search (default: false, set to true to enable)"
        },
        storeDisplayName: {
          type: Type.STRING,
          description: "Display name for the File Search store (defaults to directory name)"
        },
        includeExtensions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "File extensions to include in RAG upload (defaults to common text/code files)"
        },
        maxFileSize: {
          type: Type.INTEGER,
          description: "Maximum file size in bytes to upload (default: 10MB)"
        },
      },
      required: ["root"],
    },
  },
  {
    name: "index.find",
    description: "Search the index for files matching a query (filename or partial path). Use this when you know a filename but not the full path. Returns matching file paths sorted by relevance.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Filename or partial path to search for (e.g., 'AI-Facts', 'config.json', 'src/utils')"
        },
        limit: {
          type: Type.INTEGER,
          description: "Maximum number of results to return (default: 10)"
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fs.read",
    description: "Read the contents of a file as text.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path to the file to read",
        },
        encoding: {
          type: Type.STRING,
          description: "File encoding (default: utf8)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fs.write",
    description: "Write text content to a file. Creates the file if it doesn't exist, and creates parent directories if needed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path to the file to write",
        },
        content: {
          type: Type.STRING,
          description: "Text content to write to the file",
        },
        createDirs: {
          type: Type.BOOLEAN,
          description: "Create parent directories if they don't exist (default: true)",
        },
        encoding: {
          type: Type.STRING,
          description: "File encoding (default: utf8)",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "fs.delete",
    description: "Delete a file or directory. Use recursive=true for non-empty directories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path to the file or directory to delete",
        },
        recursive: {
          type: Type.BOOLEAN,
          description: "Delete directories recursively (default: false)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fs.copy",
    description: "Copy a file or directory to a new location. Use recursive=true for directories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        source: {
          type: Type.STRING,
          description: "Source file or directory path",
        },
        destination: {
          type: Type.STRING,
          description: "Destination path",
        },
        createDestDirs: {
          type: Type.BOOLEAN,
          description: "Create destination parent directories if needed (default: true)",
        },
        recursive: {
          type: Type.BOOLEAN,
          description: "Copy directories recursively (required for directories, default: false)",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "fs.create",
    description: "Create a directory. Creates parent directories if recursive=true.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path to the directory to create",
        },
        recursive: {
          type: Type.BOOLEAN,
          description: "Create parent directories if needed (default: true)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "text.search",
    description: "Search for a text pattern in files. Supports regex patterns and can search within directories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "File or directory path to search in",
        },
        pattern: {
          type: Type.STRING,
          description: "Text pattern or regex to search for",
        },
        caseSensitive: {
          type: Type.BOOLEAN,
          description: "Case-sensitive search (default: false)",
        },
        maxResults: {
          type: Type.INTEGER,
          description: "Maximum number of results to return (default: 100)",
        },
        fileExtensions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Filter by file extensions (e.g., ['.js', '.ts'])",
        },
        maxDepth: {
          type: Type.INTEGER,
          description: "Maximum directory depth to search (default: 0 for single file, use >0 for directories)",
        },
      },
      required: ["path", "pattern"],
    },
  },
  {
    name: "editor.open",
    description: "Open a file in the editor view. Use this when the user asks to 'open a file' or 'edit a file'. The file will be displayed in the editor panel on the right side.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path to the file to open in the editor",
        },
        encoding: {
          type: Type.STRING,
          description: "File encoding (default: utf8)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "brave.search",
    description: "Search the web using Brave Search API. ONLY use this when the user explicitly asks about current events, recent news, or information that explicitly requires up-to-date web knowledge. DO NOT use for general knowledge questions - answer those from your training data. Returns search results with titles, URLs, descriptions, and thumbnail images when available.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Search query string",
        },
        count: {
          type: Type.INTEGER,
          description: "Number of results to return (default: 10, max: 20)",
        },
        offset: {
          type: Type.INTEGER,
          description: "Offset for pagination (default: 0)",
        },
        safesearch: {
          type: Type.STRING,
          description: "Safe search setting: 'off', 'moderate', or 'strict' (default: 'moderate')",
        },
        freshness: {
          type: Type.STRING,
          description: "Filter by freshness: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year)",
        },
        country: {
          type: Type.STRING,
          description: "Country code for localized results (e.g., 'US', 'GB', 'FR')",
        },
        search_lang: {
          type: Type.STRING,
          description: "Language code for search results (e.g., 'en', 'es', 'fr')",
        },
        ui_lang: {
          type: Type.STRING,
          description: "Language code for UI elements (e.g., 'en', 'es', 'fr')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "imagen.generate",
    description: "Generate images using Google's Imagen 4.0 model. Use this when the user asks to create, generate, or make an image. IMPORTANT: When you generate an image, it will automatically be displayed in the image viewer panel on the right side of the screen. Always acknowledge to the user that the image has been generated and is now visible in the viewer. The user can zoom, pan, download, copy, or share the image using the controls below it.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: "Detailed text description of the image to generate",
        },
        numberOfImages: {
          type: Type.INTEGER,
          description: "Number of images to generate (1-4, default: 1)",
        },
        aspectRatio: {
          type: Type.STRING,
          description: "Image aspect ratio: '1:1' (square), '9:16' (portrait), '16:9' (landscape), '4:3', or '3:4' (default: '1:1')",
        },
        imageSize: {
          type: Type.STRING,
          description: "Image size: '1K' (1024x1024) or '2K' (2048x2048) (default: '1K')",
        },
        outputMimeType: {
          type: Type.STRING,
          description: "Output format: 'image/jpeg' or 'image/png' (default: 'image/jpeg')",
        },
      },
      required: ["prompt"],
    },
  },
];

/**
 * Gemini client with streaming support
 */
export class GeminiClient {
  private client: GoogleGenAI;

  constructor() {
    const env = getChatEnv();
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  /**
   * Check if error is retryable (503 Service Unavailable)
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as any;
      
      // Check for 503 status code directly
      if (err.code === 503 || err.status === 503 || err.status === 'UNAVAILABLE') {
        return true;
      }
      
      // Check nested error structure (common in Google API errors)
      if (err.error) {
        const nestedError = err.error;
        if (nestedError.code === 503 || nestedError.status === 503 || nestedError.status === 'UNAVAILABLE') {
          return true;
        }
        if (nestedError.message && typeof nestedError.message === 'string') {
          if (nestedError.message.includes('overloaded') || nestedError.message.includes('503') || nestedError.message.includes('UNAVAILABLE')) {
            return true;
          }
        }
      }
      
      // Check error message for overloaded
      if (err.message && typeof err.message === 'string') {
        // Handle JSON stringified error messages
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) {
            const parsedError = parsed.error;
            if (parsedError.code === 503 || parsedError.status === 503 || parsedError.status === 'UNAVAILABLE') {
              return true;
            }
            if (parsedError.message && typeof parsedError.message === 'string') {
              if (parsedError.message.includes('overloaded') || parsedError.message.includes('503') || parsedError.message.includes('UNAVAILABLE')) {
                return true;
              }
            }
          }
        } catch {
          // Not JSON, check string directly
        }
        
        if (err.message.includes('overloaded') || err.message.includes('503') || err.message.includes('UNAVAILABLE')) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stream chat completion with tool calling support
   * @param messages - Conversation messages
   * @param onFunctionCall - Callback for function calls
   * @param fileSearchStoreNames - Optional array of File Search store names to use
   */
  async *streamChat(
    messages: Message[],
    onFunctionCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    fileSearchStoreNames?: string[]
  ): AsyncGenerator<StreamChunk> {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 1000; // 1 second
    let retryCount = 0;

    while (retryCount <= MAX_RETRIES) {
      try {
      // Build conversation history
      const conversationHistory: Array<{
        role: "user" | "model";
        parts: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
          fileData?: { mimeType: string; fileUri: string };
          functionCall?: any;
          functionResponse?: any;
        }>;
      }> = [];

      // Add system prompt
      conversationHistory.push({
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }],
      });

      // Add conversation messages (both user and assistant)
      for (const msg of messages) {
        if (msg.role === "user") {
          const parts: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
            fileData?: { mimeType: string; fileUri: string };
          }> = [];
          
          // Add PDFs first (best practice per blueprint: PDFs before text prompt)
          if (msg.pdfs && msg.pdfs.length > 0) {
            for (const pdf of msg.pdfs) {
              if (pdf.type === 'inline') {
                parts.push({
                  inlineData: {
                    mimeType: pdf.mimeType,
                    data: pdf.data,
                  },
                });
              } else if (pdf.type === 'file_api') {
                parts.push({
                  fileData: {
                    mimeType: pdf.mimeType,
                    fileUri: pdf.data,
                  },
                });
              }
            }
          }
          
          // Add images (after PDFs, before text)
          if (msg.images && msg.images.length > 0) {
            for (const image of msg.images) {
              // Extract base64 from data URL
              const dataUrlMatch = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (dataUrlMatch) {
                const mimeType = dataUrlMatch[1] || image.mimeType;
                const base64Data = dataUrlMatch[2];
                parts.push({
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                });
              }
            }
          }
          
          // Add text prompt after PDFs and images
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          
          conversationHistory.push({
            role: "user",
            parts,
          });
        } else if (msg.role === "assistant") {
          // Add assistant messages to conversation history
          conversationHistory.push({
            role: "model",
            parts: [{ text: msg.content }],
          });
        }
      }

      const MAX_ITERATIONS = 10;
      let iterationCount = 0;

      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        // Build tools array - include function declarations and optionally file search
        const tools: any[] = [{ functionDeclarations: FUNCTION_REGISTRY }];
        
        // Add file search tool if store names are provided
        if (fileSearchStoreNames && fileSearchStoreNames.length > 0) {
          tools.push({
            file_search: {
              file_search_store_names: fileSearchStoreNames,
            },
          });
        }

        const config: GenerateContentConfig = {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 2048,
          systemInstruction: [{ text: SYSTEM_PROMPT }],
          tools,
        };

        // Retry logic for 503 errors (service overloaded)
        let stream;
        let streamRetryCount = 0;
        const MAX_STREAM_RETRIES = 3;
        const INITIAL_STREAM_RETRY_DELAY = 2000; // 2 seconds

        while (streamRetryCount <= MAX_STREAM_RETRIES) {
          try {
            stream = await this.client.models.generateContentStream({
              model: MODEL,
              contents: conversationHistory,
              config,
            });
            break; // Success, exit retry loop
          } catch (streamError) {
            if (this.isRetryableError(streamError) && streamRetryCount < MAX_STREAM_RETRIES) {
              streamRetryCount++;
              const delay = INITIAL_STREAM_RETRY_DELAY * Math.pow(2, streamRetryCount - 1); // Exponential backoff
              logger.warn(`Gemini API overloaded (503), retrying in ${delay}ms...`, { 
                attempt: streamRetryCount,
                maxRetries: MAX_STREAM_RETRIES 
              });
              await this.sleep(delay);
              continue;
            }
            // Not retryable or max retries reached, throw error
            throw streamError;
          }
        }

        if (!stream) {
          throw new Error('Failed to create stream after retries');
        }

        let previousText = "";
        let functionCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
        let hasFunctionCalls = false;

        for await (const chunk of stream) {
          // Check for function calls
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            hasFunctionCalls = true;
            for (const funcCall of chunk.functionCalls) {
              const callData = {
                id: (funcCall as any).id || `call-${Date.now()}-${Math.random()}`,
                name: funcCall.name || "",
                args: (funcCall.args || {}) as Record<string, unknown>,
              };
              functionCalls.push(callData);

              yield {
                type: "function_call",
                functionCall: callData,
              };
            }
          }

          // Extract text content from all parts
          let text = "";
          if (chunk.text) {
            text = chunk.text;
          } else if ((chunk as any).candidates && (chunk as any).candidates[0]) {
            const candidate = (chunk as any).candidates[0];
            if (candidate.content?.parts) {
              // Extract text from all text parts (ignore thoughtSignature and functionCall parts)
              const textParts: string[] = [];
              for (const part of candidate.content.parts) {
                if (part.text) {
                  textParts.push(part.text);
                }
                // Note: thoughtSignature and functionCall parts are handled separately
                // thoughtSignature is internal reasoning we can ignore
                // functionCall is handled above in the functionCalls check
              }
              text = textParts.join("");
            }
          }

          // Process text delta
          // Yield text chunks regardless of function calls - they can coexist
          if (text) {
            const delta = text.startsWith(previousText)
              ? text.slice(previousText.length)
              : text;

            if (delta) {
              yield { type: "text", text: delta };
            }
            previousText = text;
          }
        }

        // Execute function calls if any
        if (hasFunctionCalls && functionCalls.length > 0 && onFunctionCall) {
          // Add model's function calls to history
          conversationHistory.push({
            role: "model",
            parts: functionCalls.map((fc) => ({
              functionCall: {
                id: fc.id,
                name: fc.name,
                args: fc.args,
              },
            })),
          });

          // Execute and collect responses
          const functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];

          // Helper to normalize response to Record<string, unknown>
          const normalizeResponse = (result: unknown): Record<string, unknown> => {
            if (result === null || result === undefined) {
              return {};
            }
            if (typeof result === "object" && !Array.isArray(result)) {
              return result as Record<string, unknown>;
            }
            // Wrap primitives and arrays in an object
            return { output: result };
          };

          for (const funcCall of functionCalls) {
            try {
              const result = await onFunctionCall(funcCall.name, funcCall.args);
              const normalizedResponse = normalizeResponse(result);

              const functionResponse = {
                id: funcCall.id || `call-${Date.now()}-${Math.random()}`,
                name: funcCall.name,
                response: normalizedResponse,
              };

              functionResponses.push(functionResponse);

              yield {
                type: "function_response",
                functionResponse,
              };
            } catch (error) {
              const errorResponse = {
                id: funcCall.id || `call-${Date.now()}-${Math.random()}`,
                name: funcCall.name,
                response: {
                  error: error instanceof Error ? error.message : "Unknown error",
                },
              };

              functionResponses.push(errorResponse);

              yield {
                type: "function_response",
                functionResponse: errorResponse,
              };
            }
          }

          // Add function responses to history as user message
          // Function responses should match the function calls by id
          // Format: each function response should include id, name, and response
          const functionResponseParts = functionResponses.map((fr) => {
            return {
              functionResponse: {
                id: fr.id,
                name: fr.name,
                response: fr.response,
              },
            };
          });

          conversationHistory.push({
            role: "user",
            parts: functionResponseParts,
          });

          // Continue loop for next response
          continue;
        } else {
          // No function calls, we're done
          break;
        }
      }
      // Success - break out of retry loop
      break;
      } catch (error) {
        // Check if this is a retryable error (503 Service Unavailable)
        if (this.isRetryableError(error) && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1); // Exponential backoff: 1s, 2s, 4s
          logger.warn(`Gemini API overloaded (503), retrying in ${delay}ms...`, { 
            attempt: retryCount,
            maxRetries: MAX_RETRIES,
            error: error instanceof Error ? error.message : String(error)
          });
          await this.sleep(delay);
          continue; // Retry the entire request
        }
        
        // Not retryable or max retries reached
        logger.error("Gemini streaming error", error instanceof Error ? error : undefined);
        yield {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return; // Exit generator
      }
    }
  }
}

