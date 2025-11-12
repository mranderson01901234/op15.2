import { NextRequest, NextResponse } from "next/server";
import { uploadPDF } from "@/lib/pdf/upload";
import { logger } from "@/lib/utils/logger";
import Busboy from "busboy";
import { Readable } from "stream";
import type { FileInfo } from "busboy";

// Ensure this route handles FormData correctly
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    // Log request details for debugging
    const contentType = req.headers.get('content-type');
    const contentLength = req.headers.get('content-length');
    logger.info('PDF upload request received', {
      contentType,
      contentLength,
    });

    let file: File | null = null;
    let displayName: string | null = null;

    try {
      // Use busboy directly as a workaround for Next.js 16/Turbopack FormData parsing issues
      // Convert NextRequest body to a format busboy can use
      const bodyStream = req.body;
      
      if (!bodyStream) {
        throw new Error('Request body is not available');
      }

      // Parse manually using busboy
      const busboy = Busboy({
        headers: {
          'content-type': contentType || 'multipart/form-data',
        },
        limits: {
          fileSize: MAX_FILE_SIZE,
        },
      });

      const formDataFields: { [key: string]: string } = {};
      const formDataFiles: { [key: string]: { buffer: Buffer; filename: string; mimetype: string } } = {};

      await new Promise<void>((resolve, reject) => {
        busboy.on('file', (name: string, fileStream: NodeJS.ReadableStream, info: FileInfo) => {
          const { filename, mimeType } = info;
          if (name === 'file') {
            const chunks: Buffer[] = [];
            fileStream.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
            });
            fileStream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              formDataFiles[name] = {
                buffer,
                filename: filename || 'document.pdf',
                mimetype: mimeType || 'application/pdf',
              };
            });
          } else {
            fileStream.resume(); // Discard unknown files
          }
        });

        busboy.on('field', (name: string, value: string) => {
          formDataFields[name] = value;
        });

        busboy.on('finish', () => {
          resolve();
        });

        busboy.on('error', (err: Error) => {
          reject(err);
        });

        // Convert ReadableStream to Node.js stream for busboy
        if (bodyStream instanceof ReadableStream) {
          // Convert Web ReadableStream to Node.js Readable stream
          const reader = bodyStream.getReader();
          const nodeStream = Readable.from(async function* () {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield Buffer.from(value);
            }
          }());
          nodeStream.pipe(busboy);
        } else {
          // If it's already a Node.js stream, pipe directly
          (bodyStream as any).pipe(busboy);
        }
      });

      // Convert busboy results to File object
      if (formDataFiles['file']) {
        const fileData = formDataFiles['file'];
        // Create a File object from the buffer
        // Convert Buffer to Uint8Array for Blob
        const uint8Array = new Uint8Array(fileData.buffer);
        const blob = new Blob([uint8Array], { type: fileData.mimetype });
        file = new File([blob], fileData.filename, { type: fileData.mimetype }) as File;
      }
      displayName = formDataFields['displayName'] || null;

      logger.info('FormData parsed successfully using busboy', {
        hasFile: !!file,
        hasDisplayName: !!displayName,
        fileName: file?.name,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to parse FormData', error instanceof Error ? error : undefined, { 
        error: errorMessage,
        errorStack,
        contentType,
        contentLength,
      });
      return NextResponse.json(
        { 
          error: 'Failed to parse form data. Please ensure the file is being sent correctly.',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof File)) {
      logger.warn('No file provided or invalid file type', { 
        hasFile: !!file, 
        fileType: file ? typeof file : 'null' 
      });
      return NextResponse.json(
        { error: 'No file provided or invalid file type' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are supported.' },
        { status: 400 }
      );
    }

    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    logger.info('Starting PDF upload', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      displayName: displayName || file.name,
    });

    const result = await uploadPDF(file, {
      displayName: displayName || file.name,
    });

    logger.info('PDF uploaded successfully', {
      displayName: result.displayName,
      size: result.size,
      type: result.uri ? 'file_api' : 'inline',
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('PDF upload error', error instanceof Error ? error : undefined, {
      error: errorMessage,
      errorStack,
    });
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Upload failed',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

