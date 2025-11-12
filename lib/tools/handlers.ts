import type { UserContext } from "@/lib/types/user-context";
import {
  handleFsList,
  handleFsMove,
  handleFsRead,
  handleFsWrite,
  handleFsDelete,
  handleFsCopy,
  handleFsCreate,
} from "./fs";
import { handleExecRun } from "./exec";
import { handleIndexScan, handleIndexFind } from "./index";
import { handleTextSearch } from "./text";
import { handleEditorOpen } from "./editor";
import { handleBraveSearch } from "./brave";
import { handleImagenGenerate } from "./imagen";
import { logger } from "@/lib/utils/logger";

/**
 * Route tool calls to appropriate handlers
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: UserContext
): Promise<unknown> {
  logger.info("Executing tool", { name, args, userId: context.userId });

  try {
    switch (name) {
      case "fs.list":
        return await handleFsList(
          args as { path: string; depth?: number },
          context
        );

      case "fs.move":
        return await handleFsMove(
          args as {
            source: string;
            destination: string;
            createDestDirs?: boolean;
          },
          context
        );

      case "exec.run":
        return await handleExecRun(
          args as { command: string; cwd?: string; timeoutMs?: number },
          context
        );

      case "index.scan":
        return await handleIndexScan(
          args as {
            root: string;
            maxDepth?: number;
            followSymlinks?: boolean;
            enableRAG?: boolean;
            storeDisplayName?: string;
            includeExtensions?: string[];
            maxFileSize?: number;
          },
          context
        );

      case "index.find":
        return await handleIndexFind(
          args as {
            query: string;
            limit?: number;
          },
          context
        );

      case "fs.read":
        return await handleFsRead(
          args as { path: string; encoding?: BufferEncoding },
          context
        );

      case "fs.write":
        return await handleFsWrite(
          args as {
            path: string;
            content: string;
            createDirs?: boolean;
            encoding?: BufferEncoding;
          },
          context
        );

      case "fs.delete":
        return await handleFsDelete(
          args as { path: string; recursive?: boolean },
          context
        );

      case "fs.copy":
        return await handleFsCopy(
          args as {
            source: string;
            destination: string;
            createDestDirs?: boolean;
            recursive?: boolean;
          },
          context
        );

      case "fs.create":
        return await handleFsCreate(
          args as { path: string; recursive?: boolean },
          context
        );

      case "text.search":
        return await handleTextSearch(
          args as {
            path: string;
            pattern: string;
            caseSensitive?: boolean;
            maxResults?: number;
            fileExtensions?: string[];
            maxDepth?: number;
          },
          context
        );

      case "editor.open":
        return await handleEditorOpen(
          args as { path: string; encoding?: BufferEncoding },
          context
        );

      case "brave.search":
        return await handleBraveSearch(
          args as {
            query: string;
            count?: number;
            offset?: number;
            safesearch?: "off" | "moderate" | "strict";
            freshness?: "pd" | "pw" | "pm" | "py";
            country?: string;
            search_lang?: string;
            ui_lang?: string;
          },
          context
        );

      case "imagen.generate":
        return await handleImagenGenerate(
          args as {
            prompt: string;
            numberOfImages?: number;
            aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
            imageSize?: "1K" | "2K";
            outputMimeType?: "image/jpeg" | "image/png";
          },
          context
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${name}`, error instanceof Error ? error : undefined);
    throw error;
  }
}

