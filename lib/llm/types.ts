import type { PDFContent } from "@/lib/pdf/types";

/**
 * LLM message types
 */
export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  role: MessageRole;
  content: string;
  pdfs?: PDFContent[]; // Optional PDF attachments
  images?: Array<{ dataUrl: string; mimeType: string }>; // Optional image attachments
}

/**
 * Streaming chunk types
 */
export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "function_call"; functionCall: { id?: string; name: string; args: Record<string, unknown> } }
  | { type: "function_response"; functionResponse: { id: string; name: string; response: unknown } }
  | { type: "error"; error: string };

