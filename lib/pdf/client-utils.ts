/**
 * Client-safe PDF utilities
 * These functions can be safely imported in client components
 */

import type { PDFUploadResult, PDFContent } from "./types";

/**
 * Convert PDFUploadResult to PDFContent for use in messages
 * This is a pure function that can be used on both client and server
 */
export function uploadResultToPDFContent(result: PDFUploadResult): PDFContent {
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

