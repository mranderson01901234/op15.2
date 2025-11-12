"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import type { PDFContent } from "@/lib/pdf/types";
import { uploadResultToPDFContent } from "@/lib/pdf/client-utils";

interface PDFUploadProps {
  onPDFsChange: (pdfs: PDFContent[]) => void;
  maxFiles?: number;
}

export function PDFUpload({ onPDFsChange, maxFiles = 5 }: PDFUploadProps) {
  const [pdfs, setPdfs] = useState<PDFContent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, string>>({});

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newFiles = Array.from(files).slice(0, maxFiles - pdfs.length);
    
    if (newFiles.length === 0) {
      return; // Already at max files
    }

    setUploading(true);

    try {
      const uploadPromises = newFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('displayName', file.name);

        try {
          const response = await fetch('/api/pdf/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to upload ${file.name}`);
          }

          const result = await response.json();
          return uploadResultToPDFContent(result);
        } catch (error) {
          console.error(`Upload error for ${file.name}:`, error);
          throw error;
        }
      });

      const uploadedPDFs = await Promise.all(uploadPromises);
      const updatedPDFs = [...pdfs, ...uploadedPDFs];
      setPdfs(updatedPDFs);
      onPDFsChange(updatedPDFs);
    } catch (error) {
      console.error('Upload error:', error);
      // TODO: Show error toast/notification
    } finally {
      setUploading(false);
      setUploadProgress({});
    }
  }, [pdfs, maxFiles, onPDFsChange]);

  const removePDF = useCallback((index: number) => {
    const updated = pdfs.filter((_, i) => i !== index);
    setPdfs(updated);
    onPDFsChange(updated);
  }, [pdfs, onPDFsChange]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (uploading || pdfs.length >= maxFiles) return;
    handleFileSelect(e.dataTransfer.files);
  }, [uploading, pdfs.length, maxFiles, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-2">
      {/* Upload area */}
      {pdfs.length < maxFiles && (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
            uploading
              ? 'border-muted-foreground/50 bg-muted/30 cursor-not-allowed'
              : 'border-border hover:bg-muted/50'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground">
            {uploading ? 'Uploading PDFs...' : 'Attach PDF files (drag & drop or click)'}
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
      )}

      {/* PDF list */}
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pdfs.map((pdf, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[200px]" title={pdf.displayName}>
                {pdf.displayName || `PDF ${index + 1}`}
              </span>
              <button
                onClick={() => removePDF(index)}
                className="ml-auto hover:text-destructive transition-colors shrink-0"
                disabled={uploading}
                aria-label="Remove PDF"
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

