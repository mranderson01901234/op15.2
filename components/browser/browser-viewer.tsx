"use client";

import React, { useState, useEffect } from "react";
import { X, ExternalLink, ArrowLeft, ArrowRight, RefreshCw, Home, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BrowserViewerProps {
  url: string;
  title?: string | null;
  onClose: () => void;
}

export function BrowserViewer({ url: urlProp, title, onClose }: BrowserViewerProps) {
  const [currentUrl, setCurrentUrl] = useState(urlProp);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [history, setHistory] = useState<string[]>([urlProp]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [iframeError, setIframeError] = useState(false);

  const handleUrlChange = (newUrl: string) => {
    // Ensure URL has protocol
    let formattedUrl = newUrl.trim();
    if (!formattedUrl.match(/^https?:\/\//i)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    
    setCurrentUrl(formattedUrl);
    // Update history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(formattedUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCanGoBack(newHistory.length > 1);
    setCanGoForward(false);
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setCanGoBack(newIndex > 0);
      setCanGoForward(true);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setCanGoBack(true);
      setCanGoForward(newIndex < history.length - 1);
    }
  };

  const handleRefresh = () => {
    setIframeError(false);
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src; // Force reload
    }
  };

  // Detect iframe load errors
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setIframeError(false);
      // Try to detect if content is blocked by checking if we can access the iframe
      try {
        // This will throw if X-Frame-Options blocks embedding
        iframe.contentWindow?.location;
      } catch (e) {
        // Cross-origin restriction is normal, but if we get here and the page is blank,
        // it might be blocked. We'll show a message after a delay.
        setTimeout(() => {
          try {
            // Check if iframe has content
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc || iframeDoc.body?.textContent?.trim() === '') {
              setIframeError(true);
            }
          } catch {
            // Cross-origin - can't check, assume it's working
          }
        }, 2000);
      }
    };

    const handleError = () => {
      setIframeError(true);
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [currentUrl]);

  const handleHome = () => {
    handleUrlChange(urlProp);
  };

  const handleOpenInNewTab = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleUrlChange(e.currentTarget.value);
    }
  };

  return (
    <div className="relative w-full h-full bg-background flex flex-col min-w-0 min-h-0 overflow-hidden">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-background z-50 relative flex-shrink-0">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handleGoBack}
            disabled={!canGoBack}
            className="h-7 w-7"
            title="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleGoForward}
            disabled={!canGoForward}
            className="h-7 w-7"
            title="Forward"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            className="h-7 w-7"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleHome}
            className="h-7 w-7"
            title="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* URL Bar */}
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs"
            placeholder="Enter URL..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handleOpenInNewTab}
            className="h-7 w-7"
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Browser Content */}
      <div className="flex-1 overflow-hidden relative min-w-0 min-h-0">
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-8 z-10">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Unable to embed this page
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              This website blocks embedding in iframes for security reasons. 
              Click the button below to open it in a new tab instead.
            </p>
            <Button
              onClick={handleOpenInNewTab}
              variant="default"
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open in New Tab
            </Button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={currentUrl}
          className="w-full h-full border-0 min-w-0 min-h-0"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          title={title || "Browser"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onError={() => setIframeError(true)}
        />
      </div>
    </div>
  );
}

