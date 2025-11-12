import { GoogleGenAI } from "@google/genai";
import { getChatEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";
import type { PDFUploadResult, PDFUploadOptions } from "./types";

// Server-only: fs is only available in Node.js
// Use dynamic import to prevent webpack from bundling fs for client
async function getFs() {
  if (typeof window !== "undefined") {
    throw new Error("fs module is only available on the server");
  }
  return (await import("fs")).promises;
}

const SIZE_THRESHOLD = 20 * 1024 * 1024; // 20MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (File API limit)

/**
 * Upload PDF using inline base64 encoding (for files < 20MB)
 */
async function uploadInlinePDF(
  buffer: Buffer,
  options?: PDFUploadOptions
): Promise<PDFUploadResult> {
  const base64Data = buffer.toString('base64');
  
  return {
    inlineData: base64Data,
    mimeType: 'application/pdf',
    displayName: options?.displayName || 'document.pdf',
    size: buffer.length,
    state: 'ACTIVE',
  };
}

/**
 * Upload PDF using File API (for files >= 20MB)
 */
async function uploadViaFileAPI(
  buffer: Buffer,
  options?: PDFUploadOptions
): Promise<PDFUploadResult> {
  const env = getChatEnv();
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  
  // Convert Buffer to Uint8Array for the File API
  // The GoogleGenAI SDK expects a Blob
  const uint8Array = new Uint8Array(buffer);
  
  // Create Blob for File API (Node.js 18+ supports Blob)
  const fileBlob = new Blob([uint8Array], { type: 'application/pdf' });
  
  const uploadedFile = await client.files.upload({
    file: fileBlob,
    config: {
      displayName: options?.displayName || 'document.pdf',
      mimeType: 'application/pdf',
    },
  });
  
  // Poll for processing status
  const fileName = uploadedFile.name;
  if (!fileName) {
    throw new Error('Uploaded file missing name');
  }
  
  let fileStatus = await client.files.get({ name: fileName });
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (60 * 5 seconds)
  
  while (fileStatus.state === 'PROCESSING' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    fileStatus = await client.files.get({ name: fileName });
    attempts++;
    
    logger.info('PDF processing', {
      displayName: uploadedFile.displayName || options?.displayName || 'document.pdf',
      state: fileStatus.state || 'UNKNOWN',
      attempt: attempts,
    });
  }
  
  if (fileStatus.state === 'FAILED') {
    throw new Error('PDF processing failed. The file may be corrupted or unsupported.');
  }
  
  if (fileStatus.state !== 'ACTIVE') {
    throw new Error(`PDF processing incomplete. Final state: ${fileStatus.state}`);
  }
  
  const displayName = uploadedFile.displayName || options?.displayName || 'document.pdf';
  const sizeBytes = typeof uploadedFile.sizeBytes === 'number' ? uploadedFile.sizeBytes : buffer.length;
  
  return {
    uri: uploadedFile.uri || undefined,
    mimeType: 'application/pdf',
    displayName,
    size: sizeBytes,
    state: 'ACTIVE' as const,
  };
}

/**
 * Upload a PDF file
 * Automatically chooses inline (base64) for <20MB or File API for >=20MB
 */
export async function uploadPDF(
  file: File | Buffer | string,
  options?: PDFUploadOptions
): Promise<PDFUploadResult> {
  let buffer: Buffer;
  let size: number;
  
  // Convert input to buffer
  if (file instanceof File) {
    size = file.size;
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (Buffer.isBuffer(file)) {
    buffer = file;
    size = buffer.length;
  } else {
    // File path (server-only)
    if (typeof window !== "undefined") {
      throw new Error("File path upload is only supported on the server");
    }
    const fs = await getFs();
    const stats = await fs.stat(file);
    size = stats.size;
    buffer = await fs.readFile(file);
  }
  
  // Validate size
  if (size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB, got ${(size / 1024 / 1024).toFixed(2)}MB`
    );
  }
  
  // Choose upload method based on size
  if (size < SIZE_THRESHOLD) {
    logger.info('Uploading PDF inline', {
      size,
      displayName: options?.displayName,
    });
    return uploadInlinePDF(buffer, options);
  } else {
    logger.info('Uploading PDF via File API', {
      size,
      displayName: options?.displayName,
    });
    return uploadViaFileAPI(buffer, options);
  }
}


