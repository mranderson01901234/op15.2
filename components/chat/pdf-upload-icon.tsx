"use client";

import { useRef, useCallback } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { PDFContent } from "@/lib/pdf/types";
import { uploadResultToPDFContent } from "@/lib/pdf/client-utils";

interface PDFUploadIconProps {
  onPDFsChange: (pdfs: PDFContent[]) => void;
  existingPDFs: PDFContent[];
  maxFiles?: number;
  uploading?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

export function PDFUploadIcon({
  onPDFsChange,
  existingPDFs,
  maxFiles = 5,
  uploading = false,
  onUploadingChange,
  disabled = false,
}: PDFUploadIconProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newFiles = Array.from(files).slice(0, maxFiles - existingPDFs.length);
    
    if (newFiles.length === 0) {
      return; // Already at max files
    }

    if (onUploadingChange) onUploadingChange(true);

    try {
      const uploadPromises = newFiles.map(async (file) => {
        // Ensure file is a valid File object
        if (!(file instanceof File)) {
          const fileName = (file as any)?.name || 'unknown';
          throw new Error(`Invalid file object: ${fileName}`);
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('displayName', file.name);

        try {
          const response = await fetch('/api/pdf/upload', {
            method: 'POST',
            body: formData,
            // Don't set Content-Type header - browser will set it automatically with boundary
          });

          if (!response.ok) {
            let errorMessage = `Failed to upload ${file.name}`;
            try {
              const error = await response.json();
              errorMessage = error.error || error.message || errorMessage;
              if (error.details) {
                console.error('Upload error details:', error.details);
              }
            } catch (parseError) {
              // If response isn't JSON, use status text
              errorMessage = `${errorMessage} (${response.status}: ${response.statusText})`;
            }
            throw new Error(errorMessage);
          }

          const result = await response.json();
          return uploadResultToPDFContent(result);
        } catch (error) {
          console.error(`Upload error for ${file.name}:`, error);
          throw error;
        }
      });

      const uploadedPDFs = await Promise.all(uploadPromises);
      const updatedPDFs = [...existingPDFs, ...uploadedPDFs];
      onPDFsChange(updatedPDFs);
    } catch (error) {
      console.error('Upload error:', error);
      // TODO: Show error toast/notification
    } finally {
      if (onUploadingChange) onUploadingChange(false);
    }
  }, [existingPDFs, maxFiles, onPDFsChange, onUploadingChange]);

  const handleClick = useCallback(() => {
    if (disabled || existingPDFs.length >= maxFiles) return;
    fileInputRef.current?.click();
  }, [disabled, existingPDFs.length, maxFiles]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || uploading || existingPDFs.length >= maxFiles}
        className="flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Attach PDF"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={disabled || uploading || existingPDFs.length >= maxFiles}
      />
    </>
  );
}

