/**
 * PDF content types for Gemini API
 */
export interface PDFContent {
  type: 'inline' | 'file_api';
  data: string; // Base64 encoded data (inline) or File API URI (file_api)
  mimeType: 'application/pdf';
  displayName?: string;
}

/**
 * Result from PDF upload operation
 */
export interface PDFUploadResult {
  uri?: string; // File API URI (for large files)
  inlineData?: string; // Base64 encoded (for small files)
  mimeType: string;
  displayName: string;
  size: number;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

/**
 * Options for PDF upload
 */
export interface PDFUploadOptions {
  displayName?: string;
}

