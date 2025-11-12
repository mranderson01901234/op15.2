"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, Copy, Share2, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageViewerProps {
  imageUrl: string;
  onClose: () => void;
}

export function ImageViewer({ imageUrl, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(0.5); // Start with a visible scale instead of 1
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset state when image URL changes
  useEffect(() => {
    setIsImageLoaded(false);
    setScale(0.5);
    setPosition({ x: 0, y: 0 });
  }, [imageUrl]);

  // Auto-fit and center image on load
  useEffect(() => {
    if (imageRef.current && containerRef.current) {
      const img = imageRef.current;
      const container = containerRef.current;
      
      const calculateAndSetPosition = () => {
        // Use requestAnimationFrame to ensure container has proper dimensions
        requestAnimationFrame(() => {
          const containerRect = container.getBoundingClientRect();
          
          // Ensure container has valid dimensions
          if (containerRect.width === 0 || containerRect.height === 0) {
            // Retry after a short delay if container isn't ready
            setTimeout(calculateAndSetPosition, 50);
            return;
          }
          
          // Check if image has loaded and has dimensions
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            // Image not loaded yet, wait for onload
            return;
          }
          
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const containerAspect = containerRect.width / containerRect.height;
          
          let initialScale = 1;
          if (imgAspect > containerAspect) {
            // Image is wider - fit to width
            initialScale = containerRect.width / img.naturalWidth;
          } else {
            // Image is taller - fit to height
            initialScale = containerRect.height / img.naturalHeight;
          }
          
          // Scale to fit 80% of container for better initial view
          const scaledWidth = img.naturalWidth * initialScale * 0.8;
          const scaledHeight = img.naturalHeight * initialScale * 0.8;
          
          // Center the image
          const centerX = (containerRect.width - scaledWidth) / 2;
          const centerY = (containerRect.height - scaledHeight) / 2;
          
          setScale(initialScale * 0.8);
          setPosition({ x: centerX, y: centerY });
          setIsImageLoaded(true);
        });
      };
      
      // Check if image is already loaded
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        calculateAndSetPosition();
        setIsImageLoaded(true);
      } else {
        img.onload = () => {
          calculateAndSetPosition();
          setIsImageLoaded(true);
        };
        // Also trigger on error to ensure we don't hang
        img.onerror = () => {
          console.error("Failed to load image");
          setIsImageLoaded(false);
        };
      }
      
      // Also recalculate when container might resize
      const resizeObserver = new ResizeObserver(() => {
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          calculateAndSetPosition();
        }
      });
      
      resizeObserver.observe(container);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [imageUrl]);

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(10, scale * delta));
      
      if (containerRef.current && imageRef.current) {
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Zoom towards mouse position
        const scaleChange = newScale / scale;
        const newX = mouseX - (mouseX - position.x) * scaleChange;
        const newY = mouseY - (mouseY - position.y) * scaleChange;
        
        setScale(newScale);
        setPosition({ x: newX, y: newY });
      }
    },
    [scale, position]
  );

  // Handle mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Zoom functions
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(10, prev * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.1, prev / 1.2));
  }, []);

  const resetZoom = useCallback(() => {
    if (imageRef.current && containerRef.current) {
      const img = imageRef.current;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = containerRect.width / containerRect.height;
      
      let initialScale = 1;
      if (imgAspect > containerAspect) {
        initialScale = containerRect.width / img.naturalWidth;
      } else {
        initialScale = containerRect.height / img.naturalHeight;
      }
      
      // Scale to fit 80% of container
      const scaledWidth = img.naturalWidth * initialScale * 0.8;
      const scaledHeight = img.naturalHeight * initialScale * 0.8;
      
      // Center the image
      const centerX = (containerRect.width - scaledWidth) / 2;
      const centerY = (containerRect.height - scaledHeight) / 2;
      
      setScale(initialScale * 0.8);
      setPosition({ x: centerX, y: centerY });
    }
  }, []);

  // Download image
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `imagen-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  }, [imageUrl]);

  // Copy image to clipboard
  const handleCopy = useCallback(async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch (error) {
      console.error("Failed to copy image:", error);
    }
  }, [imageUrl]);

  // Share image
  const handleShare = useCallback(async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `imagen-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`, {
        type: blob.type,
      });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Generated Image",
        });
      } else {
        // Fallback: copy to clipboard
        await handleCopy();
      }
    } catch (error) {
      console.error("Failed to share image:", error);
    }
  }, [imageUrl, handleCopy]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      {/* Image */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Generated image"
        className="absolute select-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          cursor: isDragging ? "grabbing" : "grab",
          maxWidth: "none",
          maxHeight: "none",
          opacity: isImageLoaded ? 1 : 0.5, // Show image even while loading
          transition: isImageLoaded ? "opacity 0.2s ease-in" : "none",
        }}
        draggable={false}
        onLoad={() => {
          // Ensure image is marked as loaded
          if (imageRef.current) {
            setIsImageLoaded(true);
          }
        }}
      />

      {/* Controls - positioned at bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={zoomOut}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={zoomIn}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={resetZoom}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleDownload}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopy}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleShare}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <Share2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onClose}
          className="bg-background/80 backdrop-blur-sm border-border/50"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm border border-border/50 rounded px-3 py-1.5 text-xs text-muted-foreground">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

