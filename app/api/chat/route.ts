import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import { GeminiClient } from "@/lib/llm/gemini";
import { executeTool } from "@/lib/tools/handlers";
import { getUserContext, type UserContext, type RestrictionLevel } from "@/lib/types/user-context";
import { logger } from "@/lib/utils/logger";
import { extractPDFReferences, readPDFFromFilesystem } from "@/lib/pdf/utils";
import type { PDFContent } from "@/lib/pdf/types";
import { MemoryIndex } from "@/lib/index/memory-index";
import { auth } from "@clerk/nextjs/server";
import { detectImageGenerationRequest } from "@/lib/utils/image-generation-detector";
import { getBridgeManager } from "@/lib/infrastructure/bridge-manager";

const requestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  conversationId: z.string().optional(),
  fileSearchStoreNames: z.array(z.string()).optional(),
  pdfs: z.array(z.object({
    type: z.enum(['inline', 'file_api']),
    data: z.string(),
    mimeType: z.literal('application/pdf'),
    displayName: z.string().optional(),
  })).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    images: z.array(z.object({
      dataUrl: z.string(),
      mimeType: z.string(),
    })).optional(),
  })).optional(),
  editorState: z.object({
    filePath: z.string().nullable(),
    isOpen: z.boolean(),
  }).optional(),
  currentMessageImages: z.array(z.object({
    dataUrl: z.string(),
    mimeType: z.string(),
  })).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, conversationId, fileSearchStoreNames, pdfs: uploadedPDFs, history, editorState, currentMessageImages } = requestSchema.parse(body);

    // Load user workspace configuration
    // Default: '/' (filesystem root) - universal for all users
    let workspaceRoot = '/';
    let restrictionLevel: RestrictionLevel = 'unrestricted';
    let userHomeDirectory: string | undefined;
    
    try {
      // Get workspace config - includes user-specific home directory from agent
      // Use cache: 'no-store' to ensure we always get the latest workspace config
      // Use NEXT_PUBLIC_APP_URL if available, otherwise fall back to request origin
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      const workspaceUrl = `${baseUrl}/api/users/${authenticatedUserId}/workspace`;
      
      logger.info('Fetching workspace config', { 
        url: workspaceUrl, 
        baseUrl, 
        origin: req.nextUrl.origin 
      });
      
      const workspaceResponse = await fetch(workspaceUrl, {
        headers: {
          'Cookie': req.headers.get('cookie') || '',
        },
        cache: 'no-store', // Always fetch fresh workspace config
      });
      
      if (workspaceResponse.ok) {
        const workspaceConfig = await workspaceResponse.json();
        restrictionLevel = workspaceConfig.restrictionLevel || 'unrestricted';
        // userHomeDirectory is fetched fresh from agent each time (user-specific)
        userHomeDirectory = workspaceConfig.userHomeDirectory;
        
        // Set workspace root based on restriction level
        if (restrictionLevel === 'home') {
          // For home restriction, use user's home directory
          workspaceRoot = userHomeDirectory || '/';
        } else if (restrictionLevel === 'custom') {
          // For custom restriction, use the custom workspace root
          workspaceRoot = workspaceConfig.workspaceRoot || '/';
        } else {
          // For unrestricted, use filesystem root
          workspaceRoot = '/';
        }
        
        // Log the workspace root being used for debugging
        logger.info('Workspace config loaded for chat request', {
          userId: authenticatedUserId,
          restrictionLevel,
          workspaceRoot,
          userHomeDirectory,
          configWorkspaceRoot: workspaceConfig.workspaceRoot,
        });
      } else {
        logger.warn('Failed to load workspace config', {
          status: workspaceResponse.status,
          statusText: workspaceResponse.statusText,
          url: workspaceUrl,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn('Failed to load workspace config', {
        errorMessage,
        errorStack,
        origin: req.nextUrl.origin,
        hasNextPublicAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      });
      // Use defaults: '/' root (universal), no restrictions
    }
    
    // Check if agent is actually connected (for routing exec.run commands)
    const bridgeManager = getBridgeManager();
    const isAgentConnected = bridgeManager.isConnected(authenticatedUserId);
    
    logger.debug('Agent connection status', {
      userId: authenticatedUserId,
      isAgentConnected,
    });
    
    const context: UserContext = {
      userId: authenticatedUserId,
      workspaceId: undefined,
      browserBridgeConnected: isAgentConnected, // ✅ Check actual agent connection status
      workspaceRoot,
      restrictionLevel,
      userHomeDirectory,
    };

    // Get RAG store names from indexed directories (if not explicitly provided)
    let ragStoreNames = fileSearchStoreNames;
    if (!ragStoreNames || ragStoreNames.length === 0) {
      const index = new MemoryIndex();
      ragStoreNames = await index.getRAGStoreNames(context);
      if (ragStoreNames.length > 0) {
        logger.info("Using RAG stores from indexed directories", { 
          storeNames: ragStoreNames 
        });
      }
    }

    logger.info("Chat request", {
      message: message.substring(0, 100),
      conversationId,
      userId: context.userId,
      workspaceRoot: context.workspaceRoot,
      restrictionLevel: context.restrictionLevel,
      hasUploadedPDFs: !!uploadedPDFs?.length,
      ragStoreCount: ragStoreNames?.length || 0,
    });

    // Check if this is an image generation request - generate image first, then let LLM process
    const imagePrompt = detectImageGenerationRequest(message);
    let generatedImage: { dataUrl: string; mimeType: string } | null = null;
    
    if (imagePrompt) {
      logger.info("Image generation request detected", { prompt: imagePrompt });
      
      // Call imagen API directly
      try {
        // Use NEXT_PUBLIC_APP_URL if available, otherwise fall back to request origin
        // This ensures correct URL on Railway with custom domains
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const imagenUrl = `${baseUrl}/api/imagen/generate`;
        logger.info("Calling imagen API", { url: imagenUrl, prompt: imagePrompt, baseUrl, origin: req.nextUrl.origin });
        
        const imagenResponse = await fetch(imagenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": req.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            numberOfImages: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
            outputMimeType: "image/jpeg",
          }),
        });

        logger.info("Imagen API response", { 
          status: imagenResponse.status, 
          ok: imagenResponse.ok,
          url: imagenUrl 
        });

        if (!imagenResponse.ok) {
          const errorData = await imagenResponse.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage = errorData.error || errorData.message || "Failed to generate image";
          logger.error("Imagen API error response", new Error(errorMessage), { 
            status: imagenResponse.status,
            error: errorMessage,
            errorData 
          });
          throw new Error(errorMessage);
        }

        const imagenData = await imagenResponse.json();
        const images = imagenData.images || [];

        logger.info("Imagen API response data", { 
          hasImages: images.length > 0,
          imageCount: images.length 
        });

        if (images.length > 0 && images[0]?.dataUrl) {
          generatedImage = {
            dataUrl: images[0].dataUrl,
            mimeType: images[0].mimeType || "image/jpeg",
          };
          logger.info("Image generated successfully", { hasImage: !!generatedImage });
        } else {
          logger.error("No images in imagen API response", new Error("No images returned"), { imagenData });
          throw new Error("No images returned from imagen API");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Image generation failed", error instanceof Error ? error : new Error(errorMessage), {
          prompt: imagePrompt,
          origin: req.nextUrl.origin,
          errorMessage,
        });
        // Continue with LLM processing even if image generation failed
        // The LLM can handle the error message
      }
    }

    // Extract PDF references from message (if user mentions PDF paths)
    const pdfPaths = extractPDFReferences(message);
    const filesystemPDFs: PDFContent[] = [];
    
    if (pdfPaths.length > 0) {
      logger.info("Found PDF references in message", { pdfPaths });
      // Read PDFs from filesystem
      const pdfPromises = pdfPaths.map(path => readPDFFromFilesystem(path, context));
      const pdfResults = await Promise.all(pdfPromises);
      filesystemPDFs.push(...pdfResults.filter((p): p is PDFContent => p !== null));
    }

    // Combine uploaded PDFs + filesystem PDFs
    const allPDFs: PDFContent[] = [
      ...(uploadedPDFs?.map(p => ({
        type: p.type as 'inline' | 'file_api',
        data: p.data,
        mimeType: 'application/pdf' as const,
        displayName: p.displayName,
      })) || []),
      ...filesystemPDFs,
    ];

    const client = new GeminiClient();
    const encoder = new TextEncoder();

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let imageJustGenerated = false; // Track if image was just generated
          
          // Build conversation history from previous messages + current message
          const messages: Array<{
            role: "user" | "assistant";
            content: string;
            pdfs?: PDFContent[];
            images?: Array<{ dataUrl: string; mimeType: string }>;
          }> = [];
          
          // Build workspace root info that will be injected into every message
          // CRITICAL: This ensures the LLM always has the latest workspace root, even when:
          // - Workspace root changes mid-conversation
          // - User switches between conversations
          // - Workspace root is updated in the UI
          // The workspace root is fetched fresh on every request (cache: 'no-store') above
          const currentWorkspaceRoot = context.workspaceRoot || '/';
          const workspaceInfo = `🚨🚨🚨 CRITICAL WORKSPACE INFORMATION - READ THIS FIRST 🚨🚨🚨

CURRENT WORKSPACE ROOT: ${currentWorkspaceRoot}
RESTRICTION LEVEL: ${context.restrictionLevel || 'unrestricted'}

ABSOLUTE RULES - THESE OVERRIDE EVERYTHING ELSE:
1. When asked "which directory are we in" or "what directory are we in" or "current directory" or similar questions:
   → ALWAYS answer: "${currentWorkspaceRoot}"
   → DO NOT check conversation history
   → DO NOT use any directory information from previous messages
   → The answer is ALWAYS: ${currentWorkspaceRoot}

2. This is the CURRENT working directory for ALL operations
3. IGNORE any directory information from previous messages in this conversation
4. All file operations (fs.list, fs.read, fs.write, exec.run, etc.) should use paths relative to: ${currentWorkspaceRoot}
5. If the user asks about the directory, the answer is ALWAYS: ${currentWorkspaceRoot}

REMEMBER: The workspace root shown above (${currentWorkspaceRoot}) is the ONLY correct answer for "which directory are we in" questions.`;
          
          // Add conversation history if provided, injecting workspace root info into each user message
          if (history && history.length > 0) {
            for (const msg of history) {
              if (msg.role === 'user') {
                // Inject workspace root info into every user message to ensure it's always visible
                messages.push({
                  role: msg.role,
                  content: `${workspaceInfo}\n\n${msg.content}`,
                  images: msg.images,
                });
              } else {
                // Keep assistant messages as-is
                messages.push({
                  role: msg.role,
                  content: msg.content,
                  images: msg.images,
                });
              }
            }
          }
          
          // Build current message content with workspace root info
          let currentMessageContent = message;
          
          // Always prepend workspace root info to current message
          if (editorState?.isOpen && editorState?.filePath) {
            currentMessageContent = `[Editor Context: A file is currently open in the editor at path: ${editorState.filePath}]\n\n${workspaceInfo}\n\n${message}`;
          } else {
            currentMessageContent = `${workspaceInfo}\n\n${message}`;
          }
          
          // Add current message with PDFs and images
          // If we generated an image, include it in the message so LLM can see it
          const messageImages = generatedImage 
            ? [...(currentMessageImages || []), generatedImage]
            : currentMessageImages;
          
          messages.push({
            role: "user" as const,
            content: currentMessageContent,
            pdfs: allPDFs.length > 0 ? allPDFs : undefined,
            images: messageImages,
          });

          let fsListContent: string | null = null;
          let fsListCalled = false;
          let chunkCount = 0;
          let hasError = false;
          
          // Check if user is asking to list files
          const isListFilesRequest = message.toLowerCase().includes('list files') || 
                                     message.toLowerCase().includes('list files') ||
                                     message.toLowerCase() === 'list files';
          
          logger.info("Starting stream", { 
            message: message.substring(0, 50), 
            isListFilesRequest,
            messageCount: messages.length,
            hasGeneratedImage: !!generatedImage
          });
          
          // If we generated an image, send it to the frontend immediately
          if (generatedImage) {
            const imageGeneratedData = `data: ${JSON.stringify({
              type: "image_generated",
              imageUrl: generatedImage.dataUrl,
            })}\n\n`;
            controller.enqueue(encoder.encode(imageGeneratedData));
          }
          
          try {
            for await (const chunk of client.streamChat(
              messages,
              async (name, args) => {
                // Execute tool when LLM calls it
                const result = await executeTool(name, args, context);
              
              // IMMEDIATELY send formatted fs.list content if present
              if (name === "fs.list" && result && typeof result === "object") {
                fsListCalled = true;
                const response = result as { 
                  _formatted?: boolean;
                  content?: string;
                  directories?: number;
                  files?: number;
                  total?: number;
                };
                
                if (response._formatted && response.content) {
                  const content = response.content;
                  fsListContent = content;
                  logger.info("Sending formatted fs.list content IMMEDIATELY", { 
                    contentLength: content.length 
                  });
                  const formattedContent = `data: ${JSON.stringify({
                    type: "text",
                    content: content,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(formattedContent));
                }
              }
              
              // Check if this is an editor.open tool response
              if (result && typeof result === "object" && "_editorOpen" in result && result._editorOpen === true) {
                const filePath = (result as any).path;
                const fileContent = (result as any).content;
                
                // Send editor_open event before the function_response
                const editorOpenData = `data: ${JSON.stringify({
                  type: "editor_open",
                  path: filePath,
                  content: fileContent,
                })}\n\n`;
                controller.enqueue(encoder.encode(editorOpenData));
                
                // Return response with file content so LLM can see what was opened
                // For very large files, include a preview
                const maxContentLength = 50000; // ~50KB
                const contentPreview = fileContent.length > maxContentLength
                  ? fileContent.substring(0, maxContentLength) + `\n\n... (file truncated, ${fileContent.length - maxContentLength} more characters)`
                  : fileContent;
                
                return {
                  success: true,
                  message: `Opened ${filePath} in editor`,
                  path: filePath,
                  content: contentPreview,
                  contentLength: fileContent.length,
                  truncated: fileContent.length > maxContentLength,
                };
              }
              
              // Check if this is an imagen.generate tool response
              if (result && typeof result === "object" && "_imageGenerated" in result && result._imageGenerated === true) {
                const images = (result as any).images || [];
                
                // Send image_generated event to open the first image in the viewer
                if (images.length > 0 && images[0]?.dataUrl) {
                  const imageGeneratedData = `data: ${JSON.stringify({
                    type: "image_generated",
                    imageUrl: images[0].dataUrl,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(imageGeneratedData));
                  
                  // Send simple response message
                  const simpleResponse = "Yes - im working on it for you right now";
                  const textData = `data: ${JSON.stringify({
                    type: "text",
                    content: simpleResponse,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(textData));
                  
                  // Set flag to suppress subsequent LLM text generation
                  imageJustGenerated = true;
                  
                  // Add image to the assistant's response message so LLM can see it
                  // Extract base64 from data URL
                  const dataUrl = images[0].dataUrl;
                  const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (base64Match) {
                    const mimeType = base64Match[1];
                    const base64Data = base64Match[2];
                    
                    // Add image to the last assistant message in conversation
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage && lastMessage.role === "assistant") {
                      if (!lastMessage.images) {
                        lastMessage.images = [];
                      }
                      lastMessage.images.push({
                        dataUrl,
                        mimeType,
                      });
                    } else {
                      // Create a new assistant message with the image
                      messages.push({
                        role: "assistant",
                        content: "",
                        images: [{
                          dataUrl,
                          mimeType,
                        }],
                      });
                    }
                  }
                }
                
                // Return result that will cause LLM to stop generating (return empty or minimal response)
                return {
                  success: true,
                  images: (result as any).images || [],
                  _imageGenerated: true,
                  message: "Image generated successfully",
                };
              }
              
              // Check if this is fs.write and the file is open in editor
              if (name === "fs.write" && result && typeof result === "object" && "success" in result) {
                const { LocalFileSystem } = await import("@/lib/storage/local-fs");
                const fileSystem = new LocalFileSystem();
                const writePath = args.path as string;
                const resolvedWritePath = await fileSystem.resolve(writePath, context);
                
                // Check if this file is currently open in the editor
                if (editorState?.isOpen && editorState?.filePath) {
                  const editorFilePath = await fileSystem.resolve(editorState.filePath, context);
                  
                  // Normalize paths for comparison (resolve both to absolute paths)
                  const normalizedWritePath = path.normalize(resolvedWritePath);
                  const normalizedEditorPath = path.normalize(editorFilePath);
                  
                  // Compare normalized absolute paths
                  if (normalizedWritePath === normalizedEditorPath) {
                    // Send editor_update event to update the editor content
                    const editorUpdateData = `data: ${JSON.stringify({
                      type: "editor_update",
                      path: resolvedWritePath,
                      content: args.content as string,
                    })}\n\n`;
                    controller.enqueue(encoder.encode(editorUpdateData));
                  }
                }
              }
              
              return result;
            },
            ragStoreNames || undefined,
            context.workspaceRoot || '/',
            context.restrictionLevel,
            context.userHomeDirectory
          )) {
            let data: string;

            if (chunk.type === "text") {
              // Skip text chunks if image was just generated (we already sent the simple message)
              if (imageJustGenerated) {
                continue;
              }
              data = `data: ${JSON.stringify({ type: "text", content: chunk.text })}\n\n`;
            } else if (chunk.type === "function_call") {
              // Reset flag when a new function call starts
              imageJustGenerated = false;
              data = `data: ${JSON.stringify({
                type: "function_call",
                functionCall: chunk.functionCall,
              })}\n\n`;
            } else if (chunk.type === "function_response") {
              // Check if this is a brave.search response with formatted data
              const functionResponse = chunk.functionResponse;
              if (functionResponse.name === "brave.search" && functionResponse.response && typeof functionResponse.response === "object") {
                const response = functionResponse.response as { 
                  images?: unknown[]; 
                  videos?: unknown[];
                  discussions?: unknown[];
                  allSources?: Array<{ title: string; url: string; description?: string; type: string }>;
                  query?: string;
                };
                
                // Send formatted search data
                const searchData = `data: ${JSON.stringify({
                  type: "formatted_search",
                  query: response.query || "",
                  images: response.images || [],
                  videos: response.videos || [],
                  discussions: response.discussions || [],
                  allSources: response.allSources || [],
                })}\n\n`;
                controller.enqueue(encoder.encode(searchData));
                
                // Also send individual sections for backward compatibility
                if ("images" in response && response.images && Array.isArray(response.images) && response.images.length > 0) {
                  const imagesData = `data: ${JSON.stringify({
                    type: "images",
                    images: response.images,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(imagesData));
                }
                
                if ("videos" in response && response.videos && Array.isArray(response.videos) && response.videos.length > 0) {
                  const videosData = `data: ${JSON.stringify({
                    type: "videos",
                    videos: response.videos,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(videosData));
                }
              }
              
              // Note: fs.list formatted content is already sent immediately when tool executes (above)
              // No need to send it again here
              
              data = `data: ${JSON.stringify({
                type: "function_response",
                functionResponse: chunk.functionResponse,
              })}\n\n`;
            } else {
              // Error
              hasError = true;
              const errorMsg = (chunk as any).error || "Unknown error";
              logger.error("Stream chunk error", errorMsg instanceof Error ? errorMsg : new Error(String(errorMsg)));
              data = `data: ${JSON.stringify({
                type: "error",
                error: errorMsg,
              })}\n\n`;
            }

            chunkCount++;
            controller.enqueue(encoder.encode(data));
          }
          } catch (streamError) {
            logger.error("Error in stream loop", streamError instanceof Error ? streamError : undefined);
            hasError = true;
            const errorData = `data: ${JSON.stringify({
              type: "error",
              error: streamError instanceof Error ? streamError.message : "Stream error",
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          }
          
          logger.info("Stream completed", { 
            chunkCount, 
            fsListCalled, 
            hasError,
            isListFilesRequest 
          });
          
          // If it was a "list files" request but no tool was called, force it
          if (isListFilesRequest && !fsListCalled && !hasError) {
            logger.warn("List files request but no tool called - forcing fs.list");
            try {
              const result = await executeTool("fs.list", { path: "." }, context);
              if (result && typeof result === "object") {
                const response = result as { 
                  _formatted?: boolean;
                  content?: string;
                };
                if (response._formatted && response.content) {
                  const formattedContent = `data: ${JSON.stringify({
                    type: "text",
                    content: response.content,
                  })}\n\n`;
                  controller.enqueue(encoder.encode(formattedContent));
                  
                  // Also send function call/response for consistency
                  const functionCallData = `data: ${JSON.stringify({
                    type: "function_call",
                    functionCall: { name: "fs.list", args: { path: "." } },
                  })}\n\n`;
                  controller.enqueue(encoder.encode(functionCallData));
                  
                  const functionResponseData = `data: ${JSON.stringify({
                    type: "function_response",
                    functionResponse: { id: "forced-call", name: "fs.list", response: result },
                  })}\n\n`;
                  controller.enqueue(encoder.encode(functionResponseData));
                }
              }
            } catch (toolError) {
              logger.error("Error forcing fs.list", toolError instanceof Error ? toolError : undefined);
            }
          }

          // If fs.list was called but formatted content wasn't sent (shouldn't happen, but safety check)
          if (fsListCalled && fsListContent) {
            logger.warn("fs.list was called but formatted content may not have been sent, sending now");
            const formattedContent = `data: ${JSON.stringify({
              type: "text",
              content: fsListContent,
            })}\n\n`;
            controller.enqueue(encoder.encode(formattedContent));
          }

          // Send completion marker
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          logger.error("Streaming error", error instanceof Error ? error : undefined);
          const errorData = `data: ${JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    logger.error("Chat API error", error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

