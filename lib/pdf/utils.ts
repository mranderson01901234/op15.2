import { promises as fs } from "fs";
import path from "path";
import type { UserContext } from "@/lib/types/user-context";
import { LocalFileSystem } from "@/lib/storage/local-fs";
import { uploadPDF } from "./upload";
import type { PDFContent } from "./types";
import { logger } from "@/lib/utils/logger";

/**
 * Convert PDFUploadResult to PDFContent (server-side version)
 */
function uploadResultToPDFContent(result: import("./types").PDFUploadResult): PDFContent {
  if (result.uri) {
    return {
      type: 'file_api',
      data: result.uri,
      mimeType: 'application/pdf',
      displayName: result.displayName,
    };
  } else if (result.inlineData) {
    return {
      type: 'inline',
      data: result.inlineData,
      mimeType: 'application/pdf',
      displayName: result.displayName,
    };
  } else {
    throw new Error('Invalid upload result: missing both URI and inlineData');
  }
}

/**
 * Extract PDF file paths from a message
 * Matches patterns like:
 * - "~/Documents/report.pdf"
 * - "/home/user/file.pdf"
 * - "report.pdf"
 * - "the PDF at ~/Documents/invoice.pdf"
 */
export function extractPDFReferences(message: string): string[] {
  const patterns = [
    /[~\/]?[\w\/\-\.\s]+\.pdf/gi,
    /['"]([^'"]+\.pdf)['"]/gi,
  ];
  
  const matches: string[] = [];
  
  patterns.forEach(pattern => {
    const found = message.match(pattern);
    if (found) {
      found.forEach(match => {
        // Clean up the match
        const cleaned = match.replace(/['"]/g, '').trim();
        if (cleaned.endsWith('.pdf')) {
          matches.push(cleaned);
        }
      });
    }
  });
  
  // Remove duplicates and filter out false positives
  return [...new Set(matches)].filter(m => {
    // Filter out things that are clearly not file paths
    return !m.includes('http') && m.length > 4;
  });
}

/**
 * Read a PDF file from the filesystem and convert to PDFContent
 */
export async function readPDFFromFilesystem(
  filePath: string,
  context: UserContext
): Promise<PDFContent | null> {
  try {
    const fileSystem = new LocalFileSystem();
    
    // Resolve path
    const absolutePath = await fileSystem.resolve(filePath, context);
    
    // Check if file exists and is a PDF
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      logger.warn('Path is not a file', { path: absolutePath });
      return null;
    }
    
    // Read file
    const buffer = await fs.readFile(absolutePath);
    
    // Verify it's a PDF (check magic bytes)
    if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
      logger.warn('File does not appear to be a PDF', { path: absolutePath });
      return null;
    }
    
    // Upload PDF (will choose inline or File API automatically)
    const uploadResult = await uploadPDF(buffer, {
      displayName: path.basename(absolutePath),
    });
    
    return uploadResultToPDFContent(uploadResult);
  } catch (error) {
    logger.error('Failed to read PDF from filesystem', error instanceof Error ? error : undefined);
    return null;
  }
}

