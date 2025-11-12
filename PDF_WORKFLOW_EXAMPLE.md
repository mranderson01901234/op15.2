# PDF Processing: Practical Workflow Example

## How It Works in Practice

### User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User discovers PDFs via existing tools                   │
│    "List PDFs in ~/Documents"                              │
│    → fs.list finds: report.pdf, invoice.pdf, notes.pdf     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. User asks question about PDF content                     │
│    "What's in report.pdf?" OR                               │
│    "Summarize ~/Documents/report.pdf"                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Assistant automatically reads PDF                        │
│    - If <20MB: Uploads inline (base64)                      │
│    - If ≥20MB: Uses File API                                │
│    - Sends PDF + question to Gemini                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Assistant responds with PDF insights                    │
│    "This report shows Q1 revenue of $2.4M..."               │
└─────────────────────────────────────────────────────────────┘
```

## Two Ways to Use PDFs

### Method 1: Reference Existing Files (Recommended)

**User mentions a file path in their query:**

```
User: "What does ~/Documents/report.pdf say about Q4 sales?"
```

**Assistant workflow:**
1. Uses `fs.list` to verify file exists
2. Reads file from filesystem
3. Uploads to Gemini (inline or File API)
4. Processes with user's question
5. Returns answer

**Implementation:**
```typescript
// In chat API route
if (message.includes('.pdf') || message.match(/pdf/i)) {
  // Extract PDF paths from message
  const pdfPaths = extractPDFPaths(message); // ["~/Documents/report.pdf"]
  
  // Read PDFs from filesystem
  const pdfs = await Promise.all(
    pdfPaths.map(path => readPDFFromFilesystem(path))
  );
  
  // Include in message
  messages[0].pdfs = pdfs;
}
```

### Method 2: Upload PDFs via UI

**User uploads PDFs through chat interface:**

```
User: [Drags report.pdf into chat]
      "Summarize this"
```

**Assistant workflow:**
1. PDF uploaded via `/api/pdf/upload`
2. Returns upload result (inline data or File API URI)
3. Included in chat message
4. Processed with user's question

## Complete Example: Invoice Analysis

### Scenario
User has invoices in `~/Documents/Invoices/` and wants to find high-value invoices.

### Step-by-Step Interaction

```
┌─────────────────────────────────────────────────────────────┐
│ USER: "List all PDFs in ~/Documents/Invoices"              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ASSISTANT: [Uses fs.list]                                  │
│ Found 47 PDF files:                                         │
│ - Invoice_2024_001.pdf (2.3MB)                              │
│ - Invoice_2024_002.pdf (1.8MB)                              │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ USER: "Which invoices are over $1000?"                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ASSISTANT: [Reads all 47 PDFs]                             │
│ Analyzing invoices... [Processing indicator]                │
│                                                              │
│ Found 12 invoices over $1000:                               │
│ 1. Invoice_2024_001.pdf: $2,450 (Acme Corp)                 │
│ 2. Invoice_2024_015.pdf: $1,200 (Tech Solutions)            │
│ 3. Invoice_2024_023.pdf: $1,850 (Global Services)          │
│ ...                                                          │
│                                                              │
│ Should I move these to a High_Value folder?                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ USER: "Yes, and extract all the amounts as JSON"           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ASSISTANT: [Uses fs.move to organize]                       │
│ Moved 12 invoices to ~/Documents/Invoices/High_Value/       │
│                                                              │
│ Extracted amounts:                                           │
│ [                                                             │
│   { "file": "Invoice_2024_001.pdf", "amount": 2450 },       │
│   { "file": "Invoice_2024_015.pdf", "amount": 1200 },       │
│   ...                                                         │
│ ]                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Enhanced Chat Flow

```typescript
// app/api/chat/route.ts - Enhanced version

export async function POST(req: NextRequest) {
  const { message, pdfs: uploadedPDFs } = await req.json();
  
  // 1. Extract PDF paths from message (if user references files)
  const pdfPaths = extractPDFReferences(message);
  
  // 2. Read PDFs from filesystem (if paths found)
  const filesystemPDFs = await Promise.all(
    pdfPaths.map(path => readPDFFromFilesystem(path))
  );
  
  // 3. Combine uploaded PDFs + filesystem PDFs
  const allPDFs = [
    ...(uploadedPDFs || []),
    ...filesystemPDFs
  ];
  
  // 4. Create message with PDFs
  const messages: Message[] = [{
    role: "user",
    content: message,
    pdfs: allPDFs.length > 0 ? allPDFs : undefined,
  }];
  
  // 5. Stream chat with PDF support
  for await (const chunk of client.streamChat(messages, ...)) {
    // ... existing streaming logic
  }
}
```

### PDF Path Extraction Helper

```typescript
// lib/pdf/utils.ts

export function extractPDFReferences(message: string): string[] {
  // Match patterns like:
  // - "~/Documents/report.pdf"
  // - "/home/user/file.pdf"
  // - "report.pdf" (relative)
  // - "the PDF at ~/Documents/invoice.pdf"
  
  const patterns = [
    /[~\/]?[\w\/\-\.]+\.pdf/gi,
    /['"]([^'"]+\.pdf)['"]/gi,
  ];
  
  const matches: string[] = [];
  patterns.forEach(pattern => {
    const found = message.match(pattern);
    if (found) matches.push(...found);
  });
  
  return [...new Set(matches)]; // Remove duplicates
}

export async function readPDFFromFilesystem(
  path: string,
  context: UserContext
): Promise<PDFContent> {
  const fs = new LocalFileSystem();
  
  // Resolve path
  const absolutePath = await fs.resolve(path, context);
  
  // Read file
  const buffer = await fs.readFile(absolutePath, context);
  
  // Determine upload method based on size
  const size = buffer.length;
  
  if (size < 20 * 1024 * 1024) {
    return {
      type: 'inline',
      data: buffer.toString('base64'),
      mimeType: 'application/pdf',
      displayName: path.split('/').pop() || 'document.pdf',
    };
  } else {
    // Use File API for large files
    const uploadResult = await uploadViaFileAPI(buffer, {
      displayName: path.split('/').pop() || 'document.pdf',
    });
    
    return {
      type: 'file_api',
      data: uploadResult.uri!,
      mimeType: 'application/pdf',
      displayName: uploadResult.displayName,
    };
  }
}
```

## UI Enhancements

### Option 1: Automatic PDF Detection

When user mentions a PDF in their message, show a preview:

```
┌─────────────────────────────────────────────────────────────┐
│ User types: "What's in ~/Documents/report.pdf?"            │
│                                                              │
│ [PDF Preview Card appears above input]                      │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 📄 report.pdf                                        │   │
│ │ ~/Documents/report.pdf                               │   │
│ │ [Remove]                                              │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Option 2: Explicit Upload

User can drag-and-drop or click to upload:

```
┌─────────────────────────────────────────────────────────────┐
│ [Drag PDF files here or click to browse]                   │
│                                                              │
│ 📄 report.pdf (2.3MB)                    [×]                │
│ 📄 invoice.pdf (1.8MB)                   [×]                │
└─────────────────────────────────────────────────────────────┘
```

## Benefits Over Current System

### Current System
```
User: "What's in report.pdf?"
Assistant: "I can see report.pdf exists (2.3MB), but I can't read PDF files."
```

### With PDF Processing
```
User: "What's in report.pdf?"
Assistant: [Automatically reads PDF]
           "This is a quarterly sales report showing:
           - Q1 revenue: $2.4M (up 15% YoY)
           - Top product: Widget Pro ($800K)
           - Key finding: Marketing campaign increased conversions by 23%"
```

## Key Advantages

1. **Seamless Integration**: Works with existing `fs.list` and `index.scan`
2. **Natural Language**: Users can reference PDFs naturally in conversation
3. **Automatic Processing**: No need for separate upload step (optional)
4. **Smart Detection**: Automatically finds PDFs mentioned in queries
5. **Multiple Formats**: Supports both file references and direct uploads

## Technical Flow Diagram

```
User Query
    │
    ├─→ Contains PDF path? ──Yes──→ Extract path
    │                                    │
    │                                    ├─→ Read from filesystem
    │                                    │
    │                                    └─→ Upload (inline/File API)
    │
    └─→ Has uploaded PDFs? ──Yes──→ Use uploaded PDFs
    │
    └─→ No PDFs ──→ Normal chat flow
                        │
                        └─→ Process with Gemini
                                │
                                └─→ Stream response
```

This creates a **seamless experience** where users can naturally reference PDFs in their queries, and the assistant automatically reads and analyzes them.

