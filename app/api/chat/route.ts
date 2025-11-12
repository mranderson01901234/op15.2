import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import { GeminiClient } from "@/lib/llm/gemini";
import { executeTool } from "@/lib/tools/handlers";
import { getUserContext, type UserContext } from "@/lib/types/user-context";
import { logger } from "@/lib/utils/logger";
import { extractPDFReferences, readPDFFromFilesystem } from "@/lib/pdf/utils";
import type { PDFContent } from "@/lib/pdf/types";
import { MemoryIndex } from "@/lib/index/memory-index";
import { auth } from "@clerk/nextjs/server";
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

    // Get user context with browser bridge connection status
    let browserBridgeConnected = false;
    try {
      const bridgeManager = getBridgeManager();
      browserBridgeConnected = bridgeManager.isConnected(authenticatedUserId);
    } catch (error) {
      logger.warn('Failed to check bridge connection status', { error: error instanceof Error ? error.message : String(error) });
      // Continue without bridge connection - not a fatal error
    }
    
    const context: UserContext = {
      userId: authenticatedUserId,
      workspaceId: undefined,
      browserBridgeConnected,
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
      hasUploadedPDFs: !!uploadedPDFs?.length,
      ragStoreCount: ragStoreNames?.length || 0,
    });

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
          
          // Add conversation history if provided
          if (history && history.length > 0) {
            for (const msg of history) {
              messages.push({
                role: msg.role,
                content: msg.content,
                images: msg.images,
              });
            }
          }
          
          // Build current message content - include editor state if file is open
          let currentMessageContent = message;
          if (editorState?.isOpen && editorState?.filePath) {
            currentMessageContent = `[Editor Context: A file is currently open in the editor at path: ${editorState.filePath}]\n\n${message}`;
          }
          
          // Add current message with PDFs and images
          messages.push({
            role: "user" as const,
            content: currentMessageContent,
            pdfs: allPDFs.length > 0 ? allPDFs : undefined,
            images: currentMessageImages,
          });

          for await (const chunk of client.streamChat(
            messages,
            async (name, args) => {
              // Execute tool when LLM calls it
              const result = await executeTool(name, args, context);
              
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
            ragStoreNames
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
              
              data = `data: ${JSON.stringify({
                type: "function_response",
                functionResponse: chunk.functionResponse,
              })}\n\n`;
            } else {
              // Error
              data = `data: ${JSON.stringify({
                type: "error",
                error: chunk.error,
              })}\n\n`;
            }

            controller.enqueue(encoder.encode(data));
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
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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

