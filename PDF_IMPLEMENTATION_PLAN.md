# PDF Processing Implementation Plan

## Overview
Based on the `pdfblueprint` document, this plan outlines the optimal implementation for adding PDF processing capabilities to the existing LLM assistant. The implementation leverages Gemini's native vision capabilities to process PDFs up to 1000 pages, supporting both inline (<20MB) and File API (>20MB) approaches.

## Architecture Decision

### Recommended Approach: **Hybrid Model with Direct Content Integration**

Instead of creating a separate tool, integrate PDFs directly into the chat conversation flow. This approach:
- ✅ Leverages Gemini's native multimodal capabilities
- ✅ Maintains clean architecture with minimal changes
- ✅ Supports streaming responses naturally
- ✅ Handles both small and large PDFs seamlessly
- ✅ Allows multiple PDFs in a single conversation

### Why Not a Separate Tool?

Creating a `pdf.process` tool would be redundant because:
- Gemini already processes PDFs natively when passed as content
- The File API is designed for content, not tool execution
- PDFs are better treated as conversation context, not tool outputs

## Implementation Structure

```
/lib/
  /pdf/
    - upload.ts          # PDF upload handler (File API for >20MB)
    - processor.ts       # PDF processing utilities
    - types.ts           # PDF-related types
  /llm/
    - gemini.ts          # Enhanced to accept PDF parts
    - types.ts           # Extended to support PDF content

/app/api/
  /chat/
    - route.ts           # Enhanced to handle PDF content
  /pdf/
    /upload/
      - route.ts         # POST endpoint for PDF uploads

/components/
  /chat/
    - pdf-upload.tsx     # PDF upload UI component
    - pdf-viewer.tsx     # PDF preview component (optional)
```

## Phase 1: Core PDF Processing Infrastructure

### 1.1 PDF Types (`lib/pdf/types.ts`)

```typescript
export interface PDFUploadResult {
  uri?: string;           // File API URI (for large files)
  inlineData?: string;   // Base64 encoded (for small files)
  mimeType: string;
  displayName: string;
  size: number;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

export interface PDFContent {
  type: 'inline' | 'file_api';
  data: string;          // Base64 or URI
  mimeType: 'application/pdf';
  displayName?: string;
}
```

### 1.2 PDF Upload Handler (`lib/pdf/upload.ts`)

**Key Features:**
- Auto-detect file size threshold (20MB)
- Use inline base64 for <20MB files
- Use File API for >=20MB files
- Poll for processing status (File API)
- Handle errors gracefully

**Implementation Strategy:**
```typescript
export async function uploadPDF(
  file: File | Buffer | string, // File object, Buffer, or file path
  options?: { displayName?: string }
): Promise<PDFUploadResult> {
  const size = file instanceof File ? file.size : Buffer.isBuffer(file) ? file.length : (await fs.stat(file)).size;
  
  if (size < 20 * 1024 * 1024) {
    // Inline approach - base64 encode
    return uploadInlinePDF(file, options);
  } else {
    // File API approach
    return uploadViaFileAPI(file, options);
  }
}

async function uploadInlinePDF(file: File | Buffer | string): Promise<PDFUploadResult> {
  // Read file and base64 encode
  const buffer = file instanceof File 
    ? Buffer.from(await file.arrayBuffer())
    : Buffer.isBuffer(file) 
    ? file 
    : await fs.readFile(file);
  
  return {
    inlineData: buffer.toString('base64'),
    mimeType: 'application/pdf',
    displayName: options?.displayName || 'document.pdf',
    size: buffer.length,
    state: 'ACTIVE',
  };
}

async function uploadViaFileAPI(file: File | Buffer | string): Promise<PDFUploadResult> {
  const client = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY });
  
  // Upload via File API
  const uploadedFile = await client.files.upload({
    file: file instanceof File ? file : new Blob([file]),
    config: {
      displayName: options?.displayName || 'document.pdf',
      mimeType: 'application/pdf',
    },
  });
  
  // Poll for processing status
  let fileStatus = await client.files.get({ name: uploadedFile.name });
  while (fileStatus.state === 'PROCESSING') {
    await new Promise(resolve => setTimeout(resolve, 5000));
    fileStatus = await client.files.get({ name: uploadedFile.name });
  }
  
  if (fileStatus.state === 'FAILED') {
    throw new Error('PDF processing failed');
  }
  
  return {
    uri: uploadedFile.uri,
    mimeType: 'application/pdf',
    displayName: uploadedFile.displayName || 'document.pdf',
    size: uploadedFile.sizeBytes || 0,
    state: fileStatus.state === 'ACTIVE' ? 'ACTIVE' : 'FAILED',
  };
}
```

### 1.3 Enhanced LLM Types (`lib/llm/types.ts`)

```typescript
export interface Message {
  role: MessageRole;
  content: string;
  pdfs?: PDFContent[];  // Optional PDF attachments
}

export interface PDFContent {
  type: 'inline' | 'file_api';
  data: string;
  mimeType: 'application/pdf';
  displayName?: string;
}
```

### 1.4 Enhanced Gemini Client (`lib/llm/gemini.ts`)

**Key Changes:**
- Accept PDF content in messages
- Convert PDF content to Gemini API format
- Support multiple PDFs per message

```typescript
async *streamChat(
  messages: Message[],
  onFunctionCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  fileSearchStoreNames?: string[]
): AsyncGenerator<StreamChunk> {
  // Build conversation history with PDF support
  const conversationHistory: Array<{
    role: "user" | "model";
    parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
      fileData?: { mimeType: string; fileUri: string };
      functionCall?: any;
      functionResponse?: any;
    }>;
  }> = [];

  // Process messages with PDFs
  for (const msg of messages) {
    if (msg.role === "user") {
      const parts: any[] = [];
      
      // Add PDFs first (if any)
      if (msg.pdfs && msg.pdfs.length > 0) {
        for (const pdf of msg.pdfs) {
          if (pdf.type === 'inline') {
            parts.push({
              inlineData: {
                mimeType: pdf.mimeType,
                data: pdf.data,
              },
            });
          } else {
            parts.push({
              fileData: {
                mimeType: pdf.mimeType,
                fileUri: pdf.data, // URI from File API
              },
            });
          }
        }
      }
      
      // Add text prompt after PDFs (best practice per blueprint)
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      
      conversationHistory.push({
        role: "user",
        parts,
      });
    }
    // ... rest of the implementation
  }
  
  // Continue with existing streaming logic
}
```

## Phase 2: API Endpoints

### 2.1 PDF Upload API (`app/api/pdf/upload/route.ts`)

**Purpose:** Handle PDF uploads and return upload result for client to use in chat

```typescript
import { NextRequest, NextResponse } from "next/server";
import { uploadPDF } from "@/lib/pdf/upload";
import { logger } from "@/lib/utils/logger";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const displayName = formData.get('displayName') as string | null;

    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are supported.' },
        { status: 400 }
      );
    }

    // Check file size limit (50MB for File API, but we'll handle both)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const result = await uploadPDF(file, {
      displayName: displayName || file.name,
    });

    logger.info('PDF uploaded', {
      displayName: result.displayName,
      size: result.size,
      type: result.uri ? 'file_api' : 'inline',
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('PDF upload error', error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
```

### 2.2 Enhanced Chat API (`app/api/chat/route.ts`)

**Changes:**
- Accept PDF content in request
- Pass PDFs to Gemini client

```typescript
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
});

export async function POST(req: NextRequest) {
  // ... existing code ...
  const { message, conversationId, fileSearchStoreNames, pdfs } = requestSchema.parse(body);
  
  const messages: Message[] = [{
    role: "user",
    content: message,
    pdfs: pdfs?.map(p => ({
      type: p.type as 'inline' | 'file_api',
      data: p.data,
      mimeType: 'application/pdf' as const,
      displayName: p.displayName,
    })),
  }];
  
  // Pass to streamChat
  for await (const chunk of client.streamChat(messages, ...)) {
    // ... existing streaming logic ...
  }
}
```

## Phase 3: UI Components

### 3.1 PDF Upload Component (`components/chat/pdf-upload.tsx`)

**Features:**
- Drag-and-drop support
- File picker button
- Multiple file selection
- Upload progress indicator
- Preview thumbnails
- Remove uploaded files

```typescript
"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileText } from "lucide-react";
import type { PDFContent } from "@/lib/pdf/types";

interface PDFUploadProps {
  onPDFsChange: (pdfs: PDFContent[]) => void;
  maxFiles?: number;
}

export function PDFUpload({ onPDFsChange, maxFiles = 5 }: PDFUploadProps) {
  const [pdfs, setPdfs] = useState<PDFContent[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newFiles = Array.from(files).slice(0, maxFiles - pdfs.length);
    setUploading(true);

    try {
      const uploadPromises = newFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('displayName', file.name);

        const response = await fetch('/api/pdf/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const result = await response.json();
        
        return {
          type: result.uri ? 'file_api' as const : 'inline' as const,
          data: result.uri || result.inlineData,
          mimeType: 'application/pdf' as const,
          displayName: result.displayName,
        };
      });

      const uploadedPDFs = await Promise.all(uploadPromises);
      const updatedPDFs = [...pdfs, ...uploadedPDFs];
      setPdfs(updatedPDFs);
      onPDFsChange(updatedPDFs);
    } catch (error) {
      console.error('Upload error:', error);
      // Show error toast/notification
    } finally {
      setUploading(false);
    }
  }, [pdfs, maxFiles, onPDFsChange]);

  const removePDF = useCallback((index: number) => {
    const updated = pdfs.filter((_, i) => i !== index);
    setPdfs(updated);
    onPDFsChange(updated);
  }, [pdfs, onPDFsChange]);

  return (
    <div className="space-y-2">
      {/* Upload area */}
      <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
        <Upload className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">
          {uploading ? 'Uploading...' : 'Attach PDF files'}
        </span>
        <input
          type="file"
          multiple
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={uploading || pdfs.length >= maxFiles}
        />
      </label>

      {/* PDF list */}
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pdfs.map((pdf, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm"
            >
              <FileText className="h-4 w-4" />
              <span className="truncate max-w-[200px]">{pdf.displayName}</span>
              <button
                onClick={() => removePDF(index)}
                className="ml-auto hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3.2 Enhanced Chat Interface (`app/page.tsx`)

**Changes:**
- Add PDF upload component above input
- Include PDFs in API request
- Show PDF indicators in messages

```typescript
// Add state for PDFs
const [attachedPDFs, setAttachedPDFs] = useState<PDFContent[]>([]);

// Include PDFs in request
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: userInput,
    pdfs: attachedPDFs.length > 0 ? attachedPDFs : undefined,
  }),
});

// Clear PDFs after sending
setAttachedPDFs([]);
```

## Phase 4: System Prompt Enhancement

### Update System Prompt (`lib/llm/gemini.ts`)

```typescript
const SYSTEM_PROMPT = `You are a helpful local environment assistant. Use only the provided tools: fs.list, fs.move, exec.run, index.scan.

When PDF documents are provided:
- Analyze the entire document context including text, images, diagrams, charts, and tables
- Extract information accurately, preserving structure when relevant
- Answer questions based on both visual and textual elements
- If asked to summarize, provide a comprehensive summary
- If asked to extract specific information, use structured output when appropriate

Rules:
- Use tools only when needed for file operations or command execution
- If a path is unclear, call index.scan first to build an index, then try again
- Be concise and direct
- Return tool results naturally without mentioning tool calls
- You have full filesystem access - if a tool call fails, it will return a clear error message
- When listing directories, inaccessible files/directories are automatically skipped`;
```

## Phase 5: Error Handling & Edge Cases

### 5.1 File Size Validation
- Client-side: Warn before upload if >50MB
- Server-side: Reject files >50MB
- Handle File API processing failures gracefully

### 5.2 Multiple PDFs
- Limit to 5 PDFs per message (configurable)
- Check total page count (max 1000 pages)
- Show processing status for File API uploads

### 5.3 Rate Limiting
- File API has 48-hour retention
- Consider caching uploaded file URIs
- Handle expired file URIs gracefully

## Phase 6: Testing Strategy

### Unit Tests
```typescript
// lib/pdf/upload.test.ts
describe('PDF Upload', () => {
  it('should use inline for small files', async () => {
    const smallFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    const result = await uploadPDF(smallFile);
    expect(result.inlineData).toBeDefined();
    expect(result.uri).toBeUndefined();
  });

  it('should use File API for large files', async () => {
    // Mock large file
    const largeFile = createMockLargeFile(25 * 1024 * 1024);
    const result = await uploadPDF(largeFile);
    expect(result.uri).toBeDefined();
    expect(result.inlineData).toBeUndefined();
  });
});
```

### Integration Tests
- Upload PDF → Chat with PDF → Verify response includes PDF content
- Multiple PDFs in single message
- Large PDF (>20MB) processing
- File API processing status polling

## Implementation Priority

### High Priority (MVP)
1. ✅ PDF upload handler (inline + File API)
2. ✅ Enhanced Gemini client to accept PDF parts
3. ✅ PDF upload API endpoint
4. ✅ Enhanced chat API to accept PDFs
5. ✅ Basic PDF upload UI component
6. ✅ Integration with chat interface

### Medium Priority (Enhanced UX)
7. Upload progress indicators
8. PDF preview thumbnails
9. Multiple PDF support in UI
10. Error handling and user feedback

### Low Priority (Polish)
11. PDF viewer component
12. PDF annotation support
13. PDF caching/management
14. Batch PDF processing

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Only upload PDFs when user sends message
2. **Caching**: Cache File API URIs for 48 hours
3. **Streaming**: PDFs don't block text streaming
4. **Size Limits**: Enforce 50MB limit early
5. **Concurrent Uploads**: Support multiple PDF uploads in parallel

### Memory Management
- Release file buffers after upload
- Don't keep base64 data in memory longer than needed
- Use streaming for large file reads

## Security Considerations

1. **File Type Validation**: Strict PDF MIME type checking
2. **Size Limits**: Enforce 50MB maximum
3. **Path Traversal**: Validate file names
4. **Rate Limiting**: Prevent abuse of upload endpoint
5. **User Context**: Associate uploads with user context (for future multi-tenant)

## Migration Path

### Backward Compatibility
- Existing chat functionality remains unchanged
- PDF support is opt-in (only when PDFs are attached)
- No breaking changes to existing API

### Rollout Strategy
1. Deploy backend changes first (API endpoints)
2. Deploy UI changes with feature flag
3. Enable for all users after testing
4. Monitor File API usage and costs

## Success Metrics

- PDF upload success rate >95%
- Average upload time <5s for <20MB files
- File API processing time <30s for large files
- User satisfaction with PDF analysis quality
- Error rate <2%

## Future Enhancements

1. **PDF Chunking**: Split large PDFs into sections
2. **OCR Support**: Enhanced text extraction
3. **PDF Editing**: Modify PDFs based on LLM suggestions
4. **Batch Processing**: Process multiple PDFs offline
5. **PDF Comparison**: Compare multiple PDFs side-by-side
6. **Export Results**: Export analysis as structured data

---

## Quick Start Implementation Checklist

- [ ] Create `lib/pdf/types.ts` with PDF types
- [ ] Implement `lib/pdf/upload.ts` with upload logic
- [ ] Extend `lib/llm/types.ts` to support PDF content
- [ ] Enhance `lib/llm/gemini.ts` to handle PDF parts
- [ ] Create `app/api/pdf/upload/route.ts` endpoint
- [ ] Update `app/api/chat/route.ts` to accept PDFs
- [ ] Create `components/chat/pdf-upload.tsx` component
- [ ] Integrate PDF upload into `app/page.tsx`
- [ ] Update system prompt for PDF handling
- [ ] Add error handling and validation
- [ ] Write unit tests
- [ ] Test with various PDF sizes and types

