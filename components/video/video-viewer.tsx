"use client";

import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoViewerProps {
  videoUrl: string;
  videoTitle?: string | null;
  onClose: () => void;
}

// Helper function to convert YouTube URLs to embed format
function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }
  return null;
}

// Helper function to convert Vimeo URLs to embed format
function getVimeoEmbedUrl(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)/,
    /vimeo\.com\/video\/(\d+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://player.vimeo.com/video/${match[1]}`;
    }
  }
  return null;
}

// Helper function to convert Dailymotion URLs to embed format
function getDailymotionEmbedUrl(url: string): string | null {
  const patterns = [
    /dailymotion\.com\/video\/([^\/\?]+)/,
    /dai\.ly\/([^\/\?]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://www.dailymotion.com/embed/video/${match[1]}`;
    }
  }
  return null;
}

// Check if URL is a direct video file
function isDirectVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return videoExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

// Check if URL might be embeddable (try iframe as fallback)
function mightBeEmbeddable(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    // Common video hosting domains that might support iframe embedding
    const embeddableDomains = [
      'youtube.com',
      'youtu.be',
      'vimeo.com',
      'dailymotion.com',
      'dai.ly',
      'twitch.tv',
      'tiktok.com',
    ];
    return embeddableDomains.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

export function VideoViewer({ videoUrl, videoTitle, onClose }: VideoViewerProps) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(videoUrl);
  const vimeoEmbedUrl = getVimeoEmbedUrl(videoUrl);
  const dailymotionEmbedUrl = getDailymotionEmbedUrl(videoUrl);
  const isDirectVideo = isDirectVideoFile(videoUrl);
  const mightEmbed = mightBeEmbeddable(videoUrl);

  const handleOpenInNewTab = () => {
    window.open(videoUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative w-full h-full bg-background flex flex-col">
      {/* Header - always visible with prominent close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background z-50 relative flex-shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          {videoTitle && (
            <h3 className="text-sm font-medium text-foreground truncate mb-1">
              {videoTitle}
            </h3>
          )}
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground truncate block"
          >
            {videoUrl}
          </a>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handleOpenInNewTab}
            className="h-9 w-9 bg-background border-border hover:bg-muted"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            className="h-9 w-9 bg-background border-border hover:bg-destructive hover:text-destructive-foreground"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Video Player */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={videoTitle || "YouTube video"}
          />
        ) : vimeoEmbedUrl ? (
          <iframe
            src={vimeoEmbedUrl}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={videoTitle || "Vimeo video"}
          />
        ) : dailymotionEmbedUrl ? (
          <iframe
            src={dailymotionEmbedUrl}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={videoTitle || "Dailymotion video"}
          />
        ) : isDirectVideo ? (
          <video
            src={videoUrl}
            controls
            className="max-w-full max-h-full"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            Your browser does not support the video tag.
          </video>
        ) : mightEmbed ? (
          // Try to embed the URL directly as iframe (many sites support this)
          <iframe
            src={videoUrl}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={videoTitle || "Video"}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <p className="mb-4">Unable to embed this video.</p>
            <p className="text-xs mb-4 opacity-70">This video may require opening in a new tab.</p>
            <Button
              variant="outline"
              onClick={handleOpenInNewTab}
              className="bg-background/80 backdrop-blur-sm border-border/50"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in new tab
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

