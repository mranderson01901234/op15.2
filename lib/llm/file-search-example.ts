/**
 * File Search Store Usage Example
 * 
 * This file demonstrates optimal usage of File Search stores,
 * following the reference code pattern with chunking configuration.
 * 
 * Example 1: Basic usage with chunking config
 * 
 * ```typescript
 * import { uploadFileToStore } from "@/lib/llm/file-search-utils";
 * import { GeminiClient } from "@/lib/llm/gemini";
 * 
 * // Upload file with custom chunking
 * const storeName = await uploadFileToStore(
 *   "/path/to/sample.txt",
 *   "my-documents",
 *   {
 *     displayName: "My Document",
 *     chunkingConfig: {
 *       white_space_config: {
 *         max_tokens_per_chunk: 200,
 *         max_overlap_tokens: 20
 *       }
 *     }
 *   }
 * );
 * 
 * // Use in chat
 * const client = new GeminiClient();
 * for await (const chunk of client.streamChat(
 *   [{ role: "user", content: "Tell me about the document" }],
 *   undefined,
 *   [storeName]
 * )) {
 *   if (chunk.type === "text") {
 *     console.log(chunk.text);
 *   }
 * }
 * ```
 * 
 * Example 2: Upload files from different directories
 * 
 * ```typescript
 * import { uploadFilesWithConfigs } from "@/lib/llm/file-search-utils";
 * 
 * const storeName = await uploadFilesWithConfigs("my-documents", [
 *   {
 *     filePath: "/home/user/documents/doc1.txt",
 *     options: {
 *       chunkingConfig: {
 *         white_space_config: {
 *           max_tokens_per_chunk: 200,
 *           max_overlap_tokens: 20
 *         }
 *       }
 *     }
 *   },
 *   {
 *     filePath: "/var/data/report.pdf",
 *     options: {
 *       displayName: "Annual Report",
 *       chunkingConfig: {
 *         white_space_config: {
 *           max_tokens_per_chunk: 500,
 *           max_overlap_tokens: 50
 *         }
 *       }
 *     }
 *   }
 * ]);
 * ```
 * 
 * API Usage:
 * 
 * ```typescript
 * // Upload single file with chunking config
 * await fetch("/api/file-search/upload", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     filePath: "/path/to/file.txt",
 *     storeDisplayName: "my-store",
 *     displayName: "My File",
 *     chunkingConfig: {
 *       white_space_config: {
 *         max_tokens_per_chunk: 200,
 *         max_overlap_tokens: 20
 *       }
 *     }
 *   })
 * });
 * 
 * // Upload multiple files from different directories
 * await fetch("/api/file-search/upload-batch", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     storeDisplayName: "my-store",
 *     files: [
 *       {
 *         filePath: "/home/user/doc1.txt",
 *         chunkingConfig: {
 *           white_space_config: {
 *             max_tokens_per_chunk: 200,
 *             max_overlap_tokens: 20
 *           }
 *         }
 *       },
 *       {
 *         filePath: "/var/data/doc2.txt",
 *         displayName: "Document 2",
 *         chunkingConfig: {
 *           white_space_config: {
 *             max_tokens_per_chunk: 500,
 *             max_overlap_tokens: 50
 *           }
 *         }
 *       }
 *     ]
 *   })
 * });
 * ```
 */

export {};
