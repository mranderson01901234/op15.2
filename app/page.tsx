"use client";

import React, { useState, useRef, useEffect, Fragment } from "react";
import { ArrowUp, X, Copy, ThumbsUp, ThumbsDown, Volume2, Pause, Play } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PDFUploadIcon } from "@/components/chat/pdf-upload-icon";
import type { PDFContent } from "@/lib/pdf/types";
import { SplitView } from "@/components/layout/split-view";
import { CodeMirrorEditor } from "@/components/editor/codemirror-editor";
import { ImageViewer } from "@/components/image/image-viewer";
import { VideoViewer } from "@/components/video/video-viewer";
import BrowserPanel from "@/components/browser/BrowserPanel";
import { BrowserViewer } from "@/components/browser/browser-viewer";
import { useWorkspace } from "@/contexts/workspace-context";
import { useChat, type Message as ChatMessage } from "@/contexts/chat-context";
import { useChatInput } from "@/contexts/chat-input-context";
import { LocalEnvConnector } from "@/components/local-env/local-env-connector";
import { CommandsButton } from "@/components/layout/commands-button";
import { UserButton, SignedIn } from "@clerk/nextjs";

interface Thumbnail {
  src: string;
  original: string | null;
}

interface Image {
  thumbnail: Thumbnail | null;
  url: string;
  title: string;
}

interface Video {
  thumbnail: Thumbnail | null;
  url: string;
  title: string;
  duration: string | null;
  age: string | null;
}

interface Discussion {
  title: string;
  url: string;
  description: string;
  age: string | null;
}

interface Source {
  title: string;
  url: string;
  description?: string;
  type: string;
}

interface FormattedSearchData {
  query: string;
  images: Image[];
  videos: Video[];
  discussions: Discussion[];
  allSources: Source[];
}

// Message interface is now imported from chat-context, but keeping local types for compatibility
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  images?: Image[];
  videos?: Video[];
  formattedSearch?: FormattedSearchData;
  userQuery?: string; // Store the original user query for summary
  timestamp?: number;
}

// Format timestamp for display
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Get animation class for assistant messages based on content length
function getAssistantAnimationClass(messageId: string, contentLength: number): string {
  // Short messages (< 200 chars) fade in fully at once
  if (contentLength < 200) {
    return "assistant-content-fade-full";
  }
  
  // For longer messages, rotate between top-to-bottom and left-to-right
  // Use message ID hash to ensure consistent animation per message
  const hash = messageId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const animationIndex = hash % 2;
  
  return animationIndex === 0 
    ? "assistant-content-fade-top-bottom" 
    : "assistant-content-fade-left-right";
}

// Render text with word highlighting for speech
function renderTextWithHighlighting(
  content: string, 
  words: string[], 
  highlightedIndex: number | null
): React.ReactElement {
  if (highlightedIndex === null || words.length === 0) {
    return <>{content}</>;
  }

  // Create a regex to find and highlight the current word
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  const text = content;
  
  // Find all occurrences of words and highlight the one at highlightedIndex
  const wordsWithPositions: Array<{ word: string; index: number; start: number; end: number }> = [];
  let searchIndex = 0;
  
  words.forEach((word, idx) => {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const match = text.substring(searchIndex).match(regex);
    if (match) {
      const start = text.indexOf(match[0], searchIndex);
      const end = start + match[0].length;
      wordsWithPositions.push({ word: match[0], index: idx, start, end });
      searchIndex = end;
    }
  });

  // Build the highlighted text
  let currentPos = 0;
  wordsWithPositions.forEach(({ word, index, start, end }) => {
    if (currentPos < start) {
      parts.push(text.substring(currentPos, start));
    }
    if (index === highlightedIndex) {
      parts.push(
        <mark key={`highlight-${index}`} className="bg-primary/30 text-foreground px-0.5 rounded">
          {word}
        </mark>
      );
    } else {
      parts.push(word);
    }
    currentPos = end;
  });

  if (currentPos < text.length) {
    parts.push(text.substring(currentPos));
  }

  return <>{parts}</>;
}

// Format message content with code blocks, headers, and better structure
function formatMessageContent(content: string): React.ReactElement {
  const parts: React.ReactElement[] = [];
  let key = 0;

  // Split by code blocks first
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', content: match[2], language: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  // Process each segment
  segments.forEach((segment, segIdx) => {
    if (segment.type === 'code') {
      parts.push(
        <div key={`code-${key++}`} className="my-4 rounded-lg bg-muted/50 border border-border/30 overflow-hidden">
          {segment.language && (
            <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border/30 bg-muted/30 font-mono">
              {segment.language}
            </div>
          )}
          <pre className="p-4 overflow-x-auto text-sm font-mono">
            <code>{segment.content}</code>
          </pre>
        </div>
      );
    } else {
      // Process text content - split into paragraphs and format
      const lines = segment.content.split('\n');
      const textParts: React.ReactElement[] = [];
      let currentParagraph: string[] = [];

      lines.forEach((line, idx) => {
        const trimmedLine = line.trim();

        // Headers (## or ###)
        if (trimmedLine.startsWith('###')) {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
          textParts.push(
            <h3 key={`h3-${key++}`} className="text-base font-semibold text-foreground mt-6 mb-3">
              {trimmedLine.replace(/^###\s*/, '')}
            </h3>
          );
        } else if (trimmedLine.startsWith('##')) {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
          textParts.push(
            <Fragment key={`h2-section-${key++}`}>
              <h2 className="text-lg font-bold text-foreground mt-6 mb-3">
                {trimmedLine.replace(/^##\s*/, '')}
              </h2>
              <div className="h-px bg-gradient-to-r from-border/60 via-border/30 to-transparent mb-3"></div>
            </Fragment>
          );
        }
        // Introductory lines ending with colon (e.g., "This includes things like:")
        else if (trimmedLine.endsWith(':') && trimmedLine.length > 10 && trimmedLine.length < 100) {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
          textParts.push(
            <p key={`intro-${key++}`} className="text-[15px] font-semibold text-foreground mt-4 mb-2 leading-[1.8]">
              {formatInlineContent(trimmedLine)}
            </p>
          );
        }
        // Numbered lists (1., 2., 3., etc. - handles both plain and bold formatted numbers)
        else if (/^\d+\.\s/.test(trimmedLine)) {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
          // Match numbered list items - extract number and content
          const numberMatch = trimmedLine.match(/^(\d+)\.\s*(.*)/);
          if (numberMatch) {
            const number = numberMatch[1];
            const content = numberMatch[2];
            textParts.push(
              <div key={`num-li-${key++}`} className="flex items-start gap-3 mb-3 ml-1">
                <span className="text-primary font-medium mt-0.5 min-w-[1.5rem]">{number}.</span>
                <span className="flex-1 leading-[1.8] text-[15px]">{formatInlineContent(content.trim())}</span>
              </div>
            );
          }
        }
        // Bullet points
        else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
          textParts.push(
            <div key={`li-${key++}`} className="flex items-start gap-2 mb-2.5 ml-2">
              <span className="text-primary mt-1.5">•</span>
              <span className="flex-1 leading-[1.8] text-[15px]">{formatInlineContent(trimmedLine.replace(/^[-*]\s*/, ''))}</span>
            </div>
          );
        }
        // Empty line - paragraph break
        else if (trimmedLine === '') {
          if (currentParagraph.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentParagraph.join(' '))}
              </p>
            );
            currentParagraph = [];
          }
        }
        // Regular text
        else {
          currentParagraph.push(line);
        }
      });

      // Add remaining paragraph
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ');
        // Split very long paragraphs (over 500 chars) into smaller chunks for better readability
        if (paragraphText.length > 500) {
          const sentences = paragraphText.match(/[^.!?]+[.!?]+/g) || [paragraphText];
          let currentChunk: string[] = [];
          let currentLength = 0;
          
          sentences.forEach((sentence) => {
            if (currentLength + sentence.length > 500 && currentChunk.length > 0) {
              textParts.push(
                <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                  {formatInlineContent(currentChunk.join(' '))}
                </p>
              );
              currentChunk = [sentence];
              currentLength = sentence.length;
            } else {
              currentChunk.push(sentence);
              currentLength += sentence.length;
            }
          });
          
          if (currentChunk.length > 0) {
            textParts.push(
              <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
                {formatInlineContent(currentChunk.join(' '))}
              </p>
            );
          }
        } else {
          textParts.push(
            <p key={`p-${key++}`} className="mb-4 leading-[1.8] text-[15px]">
              {formatInlineContent(paragraphText)}
            </p>
          );
        }
      }

      parts.push(<div key={`seg-${segIdx}`}>{textParts}</div>);
    }
  });

  return <>{parts}</>;
}

// Format inline content (links, bold, italic)
function formatInlineContent(text: string): React.ReactElement {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  // Process bold (**text**)
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`bold-${key++}`} className="font-semibold">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    remaining = text.slice(lastIndex);
  } else {
    return <>{parts}</>;
  }

  // Process links in remaining text
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const linkParts: (string | React.ReactElement)[] = [];
  lastIndex = 0;

  while ((match = urlRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      linkParts.push(remaining.slice(lastIndex, match.index));
    }
    linkParts.push(
      <a
        key={`link-${key++}`}
        href={match[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline underline-offset-2"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    linkParts.push(remaining.slice(lastIndex));
  }

  return <>{[...parts, ...linkParts]}</>;
}

function ProcessingIndicator() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes dot-bounce {
            0%, 80%, 100% {
              opacity: 0.3;
              transform: translateY(0);
            }
            40% {
              opacity: 1;
              transform: translateY(-4px);
            }
          }
        `
      }} />
      <div className="text-gray-400 text-sm font-mono flex items-center gap-1">
        <span>processing</span>
        <span className="flex gap-1">
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0s' }}>.</span>
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>.</span>
          <span className="inline-block" style={{ animation: 'dot-bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>.</span>
        </span>
      </div>
    </>
  );
}

function FormattedSearchResponse({ 
  searchData, 
  userQuery,
  content 
}: { 
  searchData: FormattedSearchData; 
  userQuery?: string;
  content: string;
}) {
  const [activeTab, setActiveTab] = useState<"watch" | "listen" | "read">("watch");
  const { openVideo } = useWorkspace();
  
  const handleVideoClick = (videoUrl: string, videoTitle: string) => {
    // Always open in the split view (will replace current video if one is playing)
    openVideo(videoUrl, videoTitle);
  };

  // Add custom scrollbar styles for video horizontal scroll
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .video-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: #4a4a4a #1a1a1a;
      }
      .video-scrollbar::-webkit-scrollbar {
        height: 8px;
      }
      .video-scrollbar::-webkit-scrollbar-track {
        background: #1a1a1a;
        border-radius: 4px;
      }
      .video-scrollbar::-webkit-scrollbar-thumb {
        background: #4a4a4a;
        border-radius: 4px;
        border: 1px solid #1a1a1a;
      }
      .video-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #5a5a5a;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Extract domain from URL for logo
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  };

  // Parse content to extract summary and body sections
  const lines = content.split('\n').filter(l => l.trim());
  const summaryLine = lines.find(l => l.length < 100 && !l.startsWith('-') && !l.startsWith('•'));
  const summary = summaryLine || userQuery || searchData.query;
  
  // Extract bullet points from content
  const bulletPoints = lines.filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'));

  // Extract LLM-generated descriptions for sources
  // The LLM often mentions URLs and provides context - we'll extract that
  const extractLLMDescriptions = (content: string, sources: Source[]): Map<string, string> => {
    const descriptions = new Map<string, string>();
    
    // Find URL patterns in content
    const urlPattern = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlPattern) || [];
    
    // For each URL found, try to extract the description that follows
    urls.forEach((url, idx) => {
      try {
        const urlObj = new URL(url);
        const normalizedUrl = urlObj.hostname.replace('www.', '') + urlObj.pathname;
        
        // Find the source that matches this URL
        const matchingSource = sources.find(s => {
          try {
            const sUrl = new URL(s.url);
            const sNormalized = sUrl.hostname.replace('www.', '') + sUrl.pathname;
            return sNormalized === normalizedUrl || s.url === url;
          } catch {
            return s.url === url;
          }
        });
        
        if (matchingSource) {
          // Extract text after the URL (up to next URL or end of sentence/paragraph)
          const urlIndex = content.indexOf(url);
          if (urlIndex !== -1) {
            const afterUrl = content.slice(urlIndex + url.length);
            // Extract description: text after URL until next URL, newline, or end
            const nextUrlMatch = afterUrl.match(/https?:\/\/[^\s\)]+/);
            const endIndex = nextUrlMatch 
              ? afterUrl.indexOf(nextUrlMatch[0])
              : Math.min(afterUrl.indexOf('\n\n'), afterUrl.indexOf('. ', 50));
            
            let description = endIndex > 0 
              ? afterUrl.slice(0, endIndex).trim()
              : afterUrl.slice(0, 200).trim();
            
            // Clean up description
            description = description
              .replace(/^[:\-–—]\s*/, '') // Remove leading punctuation
              .replace(/\s+/g, ' ') // Normalize whitespace
              .slice(0, 200); // Limit length
            
            // Only use if it's substantial and relevant
            if (description.length > 20 && 
                !description.toLowerCase().includes('click here') &&
                !description.toLowerCase().includes('read more')) {
              descriptions.set(matchingSource.url, description);
            }
          }
        }
      } catch {
        // Skip invalid URLs
      }
    });
    
    return descriptions;
  };

  // Get LLM-generated descriptions
  const llmDescriptions = extractLLMDescriptions(content, searchData.allSources);

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <div>
        <h2 className="text-2xl font-bold mb-3">{summary}</h2>
        <div className="h-px bg-border/50 w-full"></div>
      </div>

      {/* Watch/Listen/Read Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveTab("watch")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "watch"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Watch {searchData.videos.length > 0 && `(${searchData.videos.length})`}
        </button>
        <button
          onClick={() => setActiveTab("listen")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "listen"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Listen {searchData.discussions.length > 0 && `(${searchData.discussions.length})`}
        </button>
        <button
          onClick={() => setActiveTab("read")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "read"
              ? "bg-muted/50 text-foreground border border-orange-500/30 shadow-sm"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-orange-500/10"
          }`}
        >
          Read {searchData.allSources.filter(s => s.type === 'book').length > 0 && `(${searchData.allSources.filter(s => s.type === 'book').length})`}
        </button>
      </div>

      <div className="h-px bg-border/50 w-full"></div>

      {/* Tab Content */}
      {activeTab === "watch" && searchData.videos.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto video-scrollbar" style={{ scrollbarWidth: 'thin' }}>
            <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
              {searchData.videos.map((video, idx) => (
                video.thumbnail?.src ? (
                  <button
                    key={idx}
                    onClick={() => handleVideoClick(video.url, video.title)}
                    className="block hover:opacity-80 transition-opacity group relative flex-shrink-0 text-left"
                  >
                    <div className="relative">
                      <img
                        src={video.thumbnail.src}
                        alt={video.title}
                        className="h-32 w-48 object-cover rounded border border-border/50 cursor-pointer"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded">
                        <svg className="w-8 h-8 text-white opacity-90" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      {video.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {video.duration}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2 w-48">
                      {video.title}
                    </div>
                  </button>
                ) : null
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "listen" && searchData.discussions.length > 0 && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {searchData.discussions.map((discussion, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <a
                  href={discussion.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex-1"
                >
                  {discussion.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === "read" && (
        <div className="space-y-3">
          {bulletPoints.length > 0 || searchData.allSources.filter(s => s.type === 'book').length > 0 ? (
            <ul className="space-y-2">
              {bulletPoints.length > 0 ? (
                bulletPoints.map((point, idx) => {
                  // Try to extract URL from bullet point
                  const urlMatch = point.match(/https?:\/\/[^\s\)]+/);
                  const url = urlMatch ? urlMatch[0] : null;
                  const text = point.replace(/https?:\/\/[^\s\)]+/g, '').replace(/^[-•]\s*/, '').trim();
                  
                  return (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <div className="flex-1">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {getDomain(url) && (
                              <img src={getDomain(url)!} alt="" className="w-4 h-4" />
                            )}
                            {text || url}
                          </a>
                        ) : (
                          <span>{text}</span>
                        )}
                      </div>
                    </li>
                  );
                })
              ) : (
                searchData.allSources.filter(s => s.type === 'book').slice(0, 10).map((source, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {getDomain(source.url) && (
                        <img src={getDomain(source.url)!} alt="" className="w-4 h-4" />
                      )}
                      {source.title}
                    </a>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing this time!</p>
          )}
        </div>
      )}

      <div className="h-px bg-border/50 w-full"></div>

      {/* Top Sources Section */}
      {searchData.allSources.filter(s => s.type !== 'book').length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Sources</h3>
          
          {/* Top 6 Sources with Descriptions */}
          <div className="space-y-3">
            {searchData.allSources.filter(s => s.type !== 'book').slice(0, 6).map((source, idx) => {
              // Prefer LLM-generated description, fall back to filtered Brave description
              const llmDescription = llmDescriptions.get(source.url);
              const braveDescription = source.description && 
                source.description.length > 30 &&
                !source.description.toLowerCase().includes('click here') &&
                !source.description.toLowerCase().includes('read more') &&
                source.description !== source.title;
              
              const displayDescription = llmDescription || (braveDescription ? source.description : null);
              
              return (
                <div key={idx} className="space-y-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-2 font-medium"
                  >
                    {getDomain(source.url) && (
                      <img src={getDomain(source.url)!} alt="" className="w-4 h-4" />
                    )}
                    {source.title}
                  </a>
                  {displayDescription && (
                    <p className="text-sm text-muted-foreground pl-6 line-clamp-2">
                      {displayDescription}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* See More Dropdown for remaining sources */}
          {searchData.allSources.filter(s => s.type !== 'book').length > 6 && (
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none">
                <span className="flex items-center gap-2">
                  <span>See More ({searchData.allSources.filter(s => s.type !== 'book').length - 6} more sources)</span>
                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                {searchData.allSources.filter(s => s.type !== 'book').slice(6).map((source, idx) => (
                  <a
                    key={idx + 6}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    {getDomain(source.url) && (
                      <img src={getDomain(source.url)!} alt="" className="w-3 h-3" />
                    )}
                    <span className="truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="h-px bg-border/50 w-full"></div>

      {/* Closing Summary and CTA */}
      {content && (
        <div className="text-sm text-muted-foreground">
          {content.split('\n').filter(l => l.trim() && !l.startsWith('-') && !l.startsWith('•')).slice(-2).join('\n')}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachedPDFs, setAttachedPDFs] = useState<PDFContent[]>([]);
  const [uploadingPDFs, setUploadingPDFs] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [speakingWords, setSpeakingWords] = useState<string[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const prevIsLoadingRef = useRef(false);
  const prevIsProcessingRef = useRef(false);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const { openFile, updateEditorContent, editorState, imageState, openImage, closeImage, videoState, openVideo, closeVideo, browserState, openBrowser, closeBrowser } = useWorkspace();
  const { activeChatId, getActiveChat, createChat, updateChatMessages } = useChat();
  const { setInsertTextHandler, setSendMessageHandler } = useChatInput();

  // Ensure component is mounted (client-side only) to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
    // Initialize speech synthesis (browser native, no external calls)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis;
      
      // Load voices and select a soothing male English voice
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // List of known female voice names to exclude
        const femaleVoiceNames = [
          'zira', 'susan', 'samantha', 'karen', 'fiona', 'victoria', 
          'alice', 'sarah', 'emma', 'kate', 'linda', 'lisa', 'mary',
          'nancy', 'shelley', 'tessa', 'veena', 'yuna', 'monica',
          'female', 'woman', 'girl'
        ];
        
        // List of known male voice names/keywords to prefer
        const maleVoiceNames = [
          'david', 'daniel', 'thomas', 'james', 'mark', 'richard',
          'male', 'man', 'guy', 'alex', 'fred', 'ralph', 'lee',
          'michael', 'paul', 'simon', 'tom', 'harry'
        ];
        
        // Score voices - higher score = more likely to be male
        const scoreVoice = (voice: SpeechSynthesisVoice): number => {
          const name = voice.name.toLowerCase();
          const lang = voice.lang.toLowerCase();
          let score = 0;
          
          // Exclude if it's clearly female
          if (femaleVoiceNames.some(female => name.includes(female))) {
            return -100;
          }
          
          // Bonus for male keywords
          if (maleVoiceNames.some(male => name.includes(male))) {
            score += 50;
          }
          
          // Prefer UK English (mild accent)
          if (lang.includes('en-gb') || lang.includes('en-uk')) {
            score += 20;
          } else if (lang.includes('en-us')) {
            score += 10;
          }
          
          // Prefer deeper-sounding names (avoid high-pitched sounding names)
          if (name.includes('deep') || name.includes('low') || name.includes('bass')) {
            score += 30;
          }
          
          return score;
        };
        
        // Filter and score all English voices
        const englishVoices = voices
          .filter(voice => {
            const lang = voice.lang.toLowerCase();
            return lang.startsWith('en');
          })
          .map(voice => ({
            voice,
            score: scoreVoice(voice)
          }))
          .filter(v => v.score >= 0) // Only keep non-female voices
          .sort((a, b) => b.score - a.score); // Sort by score descending
        
        // Select the highest scoring voice
        if (englishVoices.length > 0) {
          selectedVoiceRef.current = englishVoices[0].voice;
          console.log('Selected voice:', englishVoices[0].voice.name, 'Score:', englishVoices[0].score);
        }
      };
      
      // Voices may load asynchronously
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }
    };
  }, []);

  // Highlight words as they're spoken
  useEffect(() => {
    if (speakingMessageId && highlightedWordIndex !== null && highlightedWordIndex >= 0 && speakingWords.length > 0) {
      // Find the message element
      const messageElement = document.querySelector(`[data-message-id="${speakingMessageId}"]`);
      if (messageElement && highlightedWordIndex < speakingWords.length) {
        // Remove ALL previous highlights first
        const existingHighlights = messageElement.querySelectorAll('.speech-highlight');
        existingHighlights.forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            const textNode = document.createTextNode(el.textContent || '');
            parent.replaceChild(textNode, el);
            parent.normalize();
          }
        });

        // Get the word to highlight
        const wordToHighlight = speakingWords[highlightedWordIndex];
        if (!wordToHighlight) return;

        // Create regex to find the word (escape special regex characters)
        const escapedWord = wordToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        
        // Walk through all text nodes in the message element
        const walker = document.createTreeWalker(
          messageElement,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              // Skip if node is inside a mark element
              let parent = node.parentNode;
              while (parent && parent !== messageElement) {
                if (parent instanceof HTMLElement && parent.classList.contains('speech-highlight')) {
                  return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentNode;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let found = false;
        let node;
        let globalWordIndex = 0; // Track word position across all text nodes
        
        // First, collect all text nodes and their words
        const textNodes: Array<{ node: Text; words: Array<{ word: string; start: number; end: number }> }> = [];
        
        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          const words = text.split(/\s+/).filter(w => w.trim().length > 0);
          const wordPositions: Array<{ word: string; start: number; end: number }> = [];
          
          let currentPos = 0;
          words.forEach(word => {
            const start = text.indexOf(word, currentPos);
            if (start !== -1) {
              const end = start + word.length;
              wordPositions.push({ word, start, end });
              currentPos = end;
            }
          });
          
          if (wordPositions.length > 0) {
            textNodes.push({ node: node as Text, words: wordPositions });
          }
        }
        
        // Now find and highlight the word at highlightedWordIndex
        for (const { node: textNode, words } of textNodes) {
          for (const { word, start, end } of words) {
            if (globalWordIndex === highlightedWordIndex) {
              // Check if this word matches (case-insensitive)
              if (word.toLowerCase() === wordToHighlight.toLowerCase()) {
                try {
                  const range = document.createRange();
                  range.setStart(textNode, start);
                  range.setEnd(textNode, end);
                  
                  const mark = document.createElement('mark');
                  mark.className = 'speech-highlight bg-primary/30 text-foreground px-0.5 rounded transition-all duration-150';
                  mark.textContent = word;
                  
                  range.surroundContents(mark);
                  
                  // Scroll the highlighted word into view smoothly
                  mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                  
                  found = true;
                  break;
                } catch (e) {
                  console.warn('Could not highlight word:', e);
                }
              }
            }
            globalWordIndex++;
            if (found) break;
          }
          if (found) break;
        }
        
        // If we didn't find the word by occurrence, try simpler approach - just highlight first match
        if (!found) {
          const allText = messageElement.textContent || '';
          const simpleMatch = allText.match(regex);
          if (simpleMatch && simpleMatch.index !== undefined) {
            // Fallback: try to find and highlight using a simpler method
            const textNodes: Text[] = [];
            const simpleWalker = document.createTreeWalker(
              messageElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let n;
            while (n = simpleWalker.nextNode()) {
              textNodes.push(n as Text);
            }
            
            // Find the text node containing the word
            for (const textNode of textNodes) {
              const text = textNode.textContent || '';
              const idx = text.indexOf(wordToHighlight);
              if (idx !== -1) {
                try {
                  const range = document.createRange();
                  range.setStart(textNode, idx);
                  range.setEnd(textNode, idx + wordToHighlight.length);
                  
                  const mark = document.createElement('mark');
                  mark.className = 'speech-highlight bg-primary/30 text-foreground px-0.5 rounded transition-all duration-150';
                  mark.textContent = wordToHighlight;
                  
                  range.surroundContents(mark);
                  mark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                  break;
                } catch (e) {
                  console.warn('Fallback highlight failed:', e);
                }
              }
            }
          }
        }
      }
    } else if (!speakingMessageId) {
      // Remove all highlights when not speaking
      document.querySelectorAll('.speech-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          const textNode = document.createTextNode(el.textContent || '');
          parent.replaceChild(textNode, el);
          parent.normalize();
        }
      });
    }
  }, [speakingMessageId, highlightedWordIndex, speakingWords]);

  // Lightweight text-to-speech using browser's native API (non-blocking)
  const speakMessage = async (messageId: string, text: string) => {
    // Check if browser supports speech synthesis
    if (!speechSynthesisRef.current || !('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Resume if paused
    if (isPaused && speakingMessageId === messageId) {
      speechSynthesisRef.current.resume();
      setIsPaused(false);
      return;
    }

    // Stop any currently playing speech
    if (speakingMessageId) {
      speechSynthesisRef.current.cancel();
    }

    // Clean text - remove markdown formatting, code blocks, etc.
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    if (!cleanText) return;

    // Split text into words for highlighting
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    setSpeakingWords(words);
    setHighlightedWordIndex(0);
    setSpeakingMessageId(messageId);
    setIsPaused(false);

    // Use browser's native SpeechSynthesis (non-blocking, async)
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Set voice to soothing male English voice
    if (selectedVoiceRef.current) {
      utterance.voice = selectedVoiceRef.current;
      utterance.lang = selectedVoiceRef.current.lang;
    } else {
      // Fallback to UK English if voice not loaded yet
      utterance.lang = 'en-GB';
    }
    
    // Adjust speech parameters for a deeper, more masculine, soothing tone
    utterance.rate = 0.92; // Slower pace for a more soothing, deliberate delivery
    utterance.pitch = 0.75; // Much lower pitch for a deeper, more masculine voice
    utterance.volume = 1.0;
    
    currentUtteranceRef.current = utterance;

    let currentWordIndex = 0;

    // Track word boundaries for highlighting
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // Find the word index based on character position
        const charIndex = event.charIndex;
        const textBefore = cleanText.substring(0, charIndex);
        // Split by whitespace and filter empty strings, trim each word
        const wordsBefore = textBefore.split(/\s+/).filter(w => w.trim().length > 0);
        const newIndex = wordsBefore.length;
        
        // Update highlighted word index (allow it to progress through all words)
        if (newIndex >= 0 && newIndex < words.length) {
          // Use requestAnimationFrame to ensure state updates properly
          requestAnimationFrame(() => {
            setHighlightedWordIndex(newIndex);
          });
        }
      }
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    };

    // This is non-blocking - browser handles it asynchronously
    speechSynthesisRef.current.speak(utterance);
  };

  const pauseSpeaking = () => {
    if (speechSynthesisRef.current && speakingMessageId) {
      speechSynthesisRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeSpeaking = () => {
    if (speechSynthesisRef.current && speakingMessageId && isPaused) {
      speechSynthesisRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopSpeaking = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setSpeakingMessageId(null);
      setHighlightedWordIndex(null);
      setSpeakingWords([]);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    }
  };

  // Get messages from active chat
  const activeChat = getActiveChat();
  const messages: Message[] = activeChat?.messages || [];

  // Check if user is near the bottom of the chat (within 200px)
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 200;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll when user sends a message
  useEffect(() => {
    if (!isLoading && !isProcessing) {
      scrollToBottom();
    }
  }, [messages.length]);

  // Scroll last user message to top when LLM response starts
  useEffect(() => {
    const isLoadingStarted = (isLoading || isProcessing) && (!prevIsLoadingRef.current && !prevIsProcessingRef.current);
    
    if (isLoadingStarted && lastUserMessageRef.current && messagesContainerRef.current) {
      // Calculate the position relative to the scroll container
      const container = messagesContainerRef.current;
      const messageElement = lastUserMessageRef.current;
      const containerRect = container.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      const containerPadding = 16; // p-4 = 16px
      
      // Calculate scroll position: current scroll + difference in positions - padding
      const scrollTop = container.scrollTop + (messageRect.top - containerRect.top) - containerPadding;
      
      // Scroll to position the message at the top of the visible area
      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: "smooth"
      });
    }
    
    prevIsLoadingRef.current = isLoading;
    prevIsProcessingRef.current = isProcessing;
  }, [isLoading, isProcessing]);

  // Auto-scroll during streaming when content updates
  useEffect(() => {
    if ((isLoading || isProcessing) && isNearBottom()) {
      // Use requestAnimationFrame for smoother scrolling during updates
      const rafId = requestAnimationFrame(() => {
        scrollToBottom();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages, isLoading, isProcessing]);

  // Ensure there's an active chat when component mounts
  useEffect(() => {
    if (!activeChatId) {
      createChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Clear input when switching chats
  useEffect(() => {
    setInput("");
  }, [activeChatId]);

  // Auto-resize textarea based on content
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      // Check if textarea has valid dimensions before resizing
      // This prevents incorrect sizing during layout transitions
      const rect = textarea.getBoundingClientRect();
      if (rect.width === 0) {
        // Textarea not yet laid out, retry after a short delay
        setTimeout(() => autoResizeTextarea(), 50);
        return;
      }
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // max-h-[200px]
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  // Auto-resize textarea when input changes
  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  // Delay auto-resize when image viewer opens/closes to prevent layout jumps
  useEffect(() => {
    // Delay resize until after split view transition completes (300ms)
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        autoResizeTextarea();
      });
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [imageState.isOpen]);

  // Auto-focus textarea on mount and after sending messages
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
      autoResizeTextarea();
    }
  }, [isLoading, messages.length]);

  // Register insert text handler
  useEffect(() => {
    setInsertTextHandler((text: string) => {
      setInput((prev) => {
        // If there's existing text, add a space before the new text
        return prev ? `${prev} ${text}` : text;
      });
      // Focus the textarea after inserting
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
          autoResizeTextarea();
        }
      }, 0);
    });
  }, [setInsertTextHandler]);

  // Register send message handler
  useEffect(() => {
    setSendMessageHandler(async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Ensure we have an active chat
      let currentChatId = activeChatId;
      let currentMessages = messages;
      
      if (!currentChatId) {
        currentChatId = createChat();
        currentMessages = [];
      }

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const userInput = text;
      const updatedMessages = [...currentMessages, userMessage];
      updateChatMessages(currentChatId, updatedMessages);
      
      // Store user query for potential search summary
      const assistantMessageId = `assistant-${Date.now()}`;
      const messagesWithAssistant = [
        ...updatedMessages,
        { id: assistantMessageId, role: "assistant" as const, content: "", userQuery: text, timestamp: Date.now() },
      ];
      updateChatMessages(currentChatId, messagesWithAssistant);
      setInput("");
      setAttachedPDFs([]);
      setIsLoading(true);
      setIsProcessing(true);

      try {
        // Prepare conversation history (include images from assistant messages)
        const conversationHistory = currentMessages
          .filter(msg => msg.role === "user" || msg.role === "assistant")
          .map(msg => {
            const historyMsg: any = {
              role: msg.role,
              content: msg.content,
            };
            // Include generated images from assistant messages
            if (msg.role === "assistant" && (msg as any).generatedImage) {
              historyMsg.images = [{
                dataUrl: (msg as any).generatedImage,
                mimeType: (msg as any).generatedImage.match(/^data:([^;]+);base64/)?.[1] || "image/jpeg",
              }];
            }
            return historyMsg;
          });
        
        // Check if user is asking about an image - if so, include the most recent generated image
        const imageKeywords = ["image", "picture", "photo", "it", "this image", "the image", "that image"];
        const userMessageLower = userInput.toLowerCase();
        const isAskingAboutImage = imageKeywords.some(keyword => userMessageLower.includes(keyword));
        
        // Find the most recent generated image in conversation history
        let imageToInclude: { dataUrl: string; mimeType: string } | null = null;
        if (isAskingAboutImage) {
          for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const msg = conversationHistory[i];
            if (msg.images && msg.images.length > 0) {
              imageToInclude = msg.images[0];
              break;
            }
          }
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userInput,
            pdfs: attachedPDFs.length > 0 ? attachedPDFs : undefined,
            history: conversationHistory,
            currentMessageImages: imageToInclude ? [imageToInclude] : undefined,
            editorState: {
              filePath: editorState.filePath,
              isOpen: editorState.isOpen,
            },
          }),
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                setIsLoading(false);
                setIsProcessing(false);
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "text") {
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: msg.content + parsed.content }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "function_call") {
                  console.log("Tool call:", parsed.functionCall);
                } else if (parsed.type === "images") {
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, images: parsed.images }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "videos") {
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, videos: parsed.videos }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "formatted_search") {
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, formattedSearch: parsed }
                          : msg
                      )
                    );
                  }
                } else if (parsed.type === "editor_open") {
                  if (parsed.path && parsed.content !== undefined) {
                    openFile(parsed.path, parsed.content);
                  }
                } else if (parsed.type === "editor_update") {
                  if (parsed.path && parsed.content !== undefined && editorState.filePath) {
                    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase().trim();
                    const updatePath = normalizePath(parsed.path);
                    const editorPath = normalizePath(editorState.filePath);
                    
                    if (updatePath === editorPath || updatePath.endsWith(editorPath) || editorPath.endsWith(updatePath)) {
                      updateEditorContent(parsed.content);
                    }
                  }
                } else if (parsed.type === "image_generated") {
                  if (parsed.imageUrl) {
                    openImage(parsed.imageUrl);
                    // Store the generated image URL in the assistant message for conversation history
                    if (currentChatId) {
                      updateChatMessages(currentChatId, (prev: Message[]) =>
                        prev.map((msg: Message) =>
                          msg.id === assistantMessageId
                            ? { ...msg, generatedImage: parsed.imageUrl } as any
                            : msg
                        )
                      );
                    }
                  }
                } else if (parsed.type === "error") {
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: msg.content + `\n\nError: ${parsed.error}` }
                          : msg
                      )
                    );
                  }
                  setIsLoading(false);
                  setIsProcessing(false);
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        if (currentChatId) {
          updateChatMessages(currentChatId, (prev: Message[]) =>
            prev.map((msg: Message) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: msg.content + `\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
                  }
                : msg
            )
          );
        }
        setIsLoading(false);
        setIsProcessing(false);
      }
    });
  }, [setSendMessageHandler, isLoading, activeChatId, messages, createChat, updateChatMessages, editorState, openFile, updateEditorContent]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && attachedPDFs.length === 0) || isLoading) return;

    // Close image viewer when submitting a new message so user can see their input clearly
    // The new image will automatically open when it's generated
    const wasImageOpen = imageState.isOpen;
    if (wasImageOpen) {
      closeImage();
    }

    // Ensure we have an active chat
    let currentChatId = activeChatId;
    let currentMessages = messages;
    
    if (!currentChatId) {
      currentChatId = createChat();
      // For a new chat, start with empty messages
      currentMessages = [];
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    const userInput = input;
    const updatedMessages = [...currentMessages, userMessage];
    updateChatMessages(currentChatId, updatedMessages);

    // Store user query for potential search summary
    const assistantMessageId = `assistant-${Date.now()}`;
    const messagesWithAssistant = [
      ...updatedMessages,
      { id: assistantMessageId, role: "assistant" as const, content: "", userQuery: input, timestamp: Date.now() },
    ];
    updateChatMessages(currentChatId, messagesWithAssistant);
    setInput("");
    setAttachedPDFs([]); // Clear PDFs after sending
    setIsLoading(true);
    setIsProcessing(true);
    
    // Reset textarea height after clearing input
    // If image was open, delay resize until after split view transition completes (300ms)
    const delay = wasImageOpen ? 350 : 0;
    setTimeout(() => {
      // Use requestAnimationFrame to ensure layout has updated
      requestAnimationFrame(() => {
        autoResizeTextarea();
      });
    }, delay);

    try {
      // Prepare conversation history (exclude the current message we're about to send)
      // Include images from assistant messages that have generated images
      const conversationHistory = currentMessages
        .filter(msg => msg.role === "user" || msg.role === "assistant")
        .map(msg => {
          const historyMsg: any = {
            role: msg.role,
            content: msg.content,
          };
          // Include generated images from assistant messages
          if (msg.role === "assistant" && (msg as any).generatedImage) {
            historyMsg.images = [{
              dataUrl: (msg as any).generatedImage,
              mimeType: (msg as any).generatedImage.match(/^data:([^;]+);base64/)?.[1] || "image/jpeg",
            }];
          }
          return historyMsg;
        });
      
      // Check if user is asking about an image - if so, include the most recent generated image
      const imageKeywords = ["image", "picture", "photo", "it", "this image", "the image", "that image"];
      const userMessageLower = userInput.toLowerCase();
      const isAskingAboutImage = imageKeywords.some(keyword => userMessageLower.includes(keyword));
      
      // Find the most recent generated image in conversation history
      let imageToInclude: { dataUrl: string; mimeType: string } | null = null;
      if (isAskingAboutImage) {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
          const msg = conversationHistory[i];
          if (msg.images && msg.images.length > 0) {
            imageToInclude = msg.images[0];
            break;
          }
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userInput,
          pdfs: attachedPDFs.length > 0 ? attachedPDFs : undefined,
          history: conversationHistory,
          currentMessageImages: imageToInclude ? [imageToInclude] : undefined,
          editorState: {
            filePath: editorState.filePath,
            isOpen: editorState.isOpen,
          },
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") {
              setIsLoading(false);
              setIsProcessing(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "text") {
                if (currentChatId) {
                  updateChatMessages(currentChatId, (prev: Message[]) =>
                    prev.map((msg: Message) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: msg.content + parsed.content }
                        : msg
                    )
                  );
                }
              } else if (parsed.type === "function_call") {
                console.log("Tool call:", parsed.functionCall);
              } else if (parsed.type === "images") {
                // Add images to the current assistant message
                if (currentChatId) {
                  updateChatMessages(currentChatId, (prev: Message[]) =>
                    prev.map((msg: Message) =>
                      msg.id === assistantMessageId
                        ? { ...msg, images: parsed.images }
                        : msg
                    )
                  );
                }
              } else if (parsed.type === "videos") {
                // Add videos to the current assistant message
                if (currentChatId) {
                  updateChatMessages(currentChatId, (prev: Message[]) =>
                    prev.map((msg: Message) =>
                      msg.id === assistantMessageId
                        ? { ...msg, videos: parsed.videos }
                        : msg
                    )
                  );
                }
              } else if (parsed.type === "formatted_search") {
                // Add formatted search data to the current assistant message
                if (currentChatId) {
                  updateChatMessages(currentChatId, (prev: Message[]) =>
                    prev.map((msg: Message) =>
                      msg.id === assistantMessageId
                        ? { ...msg, formattedSearch: parsed }
                        : msg
                    )
                  );
                }
              } else if (parsed.type === "editor_open") {
                // Open file in editor when LLM requests it
                if (parsed.path && parsed.content !== undefined) {
                  openFile(parsed.path, parsed.content);
                }
              } else if (parsed.type === "editor_update") {
                // Update editor content when LLM edits a file that's open
                // Compare paths (handle both absolute and relative paths)
                // Only update if content is provided and not empty (to prevent clearing the editor)
                if (parsed.path && parsed.content !== undefined && parsed.content !== null && editorState.filePath) {
                  // Normalize paths for comparison (case-insensitive, handle different separators)
                  const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase().trim();
                  const updatePath = normalizePath(parsed.path);
                  const editorPath = normalizePath(editorState.filePath);
                  
                  // Check if paths match (exact match or if one ends with the other)
                  if (updatePath === editorPath || updatePath.endsWith(editorPath) || editorPath.endsWith(updatePath)) {
                    // Only update if content is a non-empty string
                    // Empty string would clear the editor, which we want to avoid during streaming
                    if (typeof parsed.content === 'string' && parsed.content.length > 0) {
                      updateEditorContent(parsed.content);
                    }
                  }
                }
              } else if (parsed.type === "image_generated") {
                if (parsed.imageUrl) {
                  openImage(parsed.imageUrl);
                  // Store the generated image URL in the assistant message for conversation history
                  if (currentChatId) {
                    updateChatMessages(currentChatId, (prev: Message[]) =>
                      prev.map((msg: Message) =>
                        msg.id === assistantMessageId
                          ? { ...msg, generatedImage: parsed.imageUrl } as any
                          : msg
                      )
                    );
                  }
                }
              } else if (parsed.type === "browser_open") {
                // Browser feature enabled - open browser with URL from LLM
                if (parsed.url) {
                  openBrowser(parsed.url, parsed.title || undefined);
                }
              } else if (parsed.type === "error") {
                if (currentChatId) {
                  updateChatMessages(currentChatId, (prev: Message[]) =>
                    prev.map((msg: Message) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: msg.content + `\n\nError: ${parsed.error}` }
                        : msg
                    )
                  );
                }
                setIsLoading(false);
                setIsProcessing(false);
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      if (currentChatId) {
        updateChatMessages(currentChatId, (prev: Message[]) =>
          prev.map((msg: Message) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content + `\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
                }
              : msg
          )
        );
      }
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <SplitView>
      <div className="flex h-full flex-col bg-background overflow-hidden relative">
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes fadeInAssistant {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeInContent {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeInTopToBottom {
              from {
                opacity: 0;
                clip-path: inset(0 0 100% 0);
              }
              to {
                opacity: 1;
                clip-path: inset(0 0 0 0);
              }
            }
            @keyframes fadeInLeftToRight {
              from {
                opacity: 0;
                clip-path: inset(0 100% 0 0);
              }
              to {
                opacity: 1;
                clip-path: inset(0 0 0 0);
              }
            }
            @keyframes fadeInFull {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            .assistant-content-fade-full {
              animation: fadeInFull 1.2s ease-in-out forwards;
            }
            .assistant-content-fade-top-bottom {
              animation: fadeInTopToBottom 1.8s ease-in-out forwards;
            }
            .assistant-content-fade-left-right {
              animation: fadeInLeftToRight 1.8s ease-in-out forwards;
            }
          `
        }} />
        {/* Local Environment Status - Top Left */}
        <div className="absolute top-4 left-4 z-10">
          <LocalEnvConnector />
        </div>
        {/* Messages Area - Scrollable */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 premium-scrollbar">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-yellow-100 text-sm">Start a conversation...</p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl w-full pt-32 pb-24">
            {messages.map((message, index) => {
              // Only show assistant messages if they have content (avoid showing empty streaming placeholders)
              const shouldShow = message.role === "user" || message.content || message.formattedSearch || (message.images && message.images.length > 0) || (message.videos && message.videos.length > 0);

              if (!shouldShow) return null;

              // Use a key that includes content length for assistant messages to trigger re-mount on first content
              const messageKey = message.role === "assistant" && message.content
                ? `${message.id}-${message.content.length > 0 ? 'visible' : 'empty'}`
                : message.id;
              
              // Determine animation class based on content length
              // Short messages (< 200 chars) fade in fully, longer messages rotate between top-to-bottom and left-to-right
              const contentLength = message.content?.length || 0;
              const animationClass = message.role === "assistant" && message.content && !message.formattedSearch
                ? getAssistantAnimationClass(message.id, contentLength)
                : "";

              // Find the last user message to attach ref (check if this is the last user message)
              const lastUserMessageIndex = messages.map((m, idx) => m.role === "user" ? idx : -1).filter(idx => idx !== -1).pop();
              const isLastUserMessage = message.role === "user" && lastUserMessageIndex !== undefined && index === lastUserMessageIndex;

              return (
              <div
                key={messageKey}
                ref={isLastUserMessage ? lastUserMessageRef : null}
                className={`flex mb-8 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`${
                    message.role === "user" ? "max-w-[75%]" : "max-w-[92%]"
                  } group relative ${
                    message.role === "assistant"
                      ? "pr-3 py-3 rounded-r-sm hover:bg-muted/20"
                      : ""
                  }`}
                  style={message.role === "assistant" ? {
                    animation: 'fadeInAssistant 0.8s ease-out forwards',
                    willChange: 'opacity',
                    maxWidth: 'min(92%, 70ch)', // Optimal reading width is ~70 characters
                  } : {
                    animation: 'fadeIn 0.3s ease-in-out',
                    animationFillMode: 'backwards',
                    animationDelay: `${index * 0.05}s`,
                  }}
                >
                  {/* Formatted Search Response */}
                  {message.role === "assistant" && message.formattedSearch && (
                    <FormattedSearchResponse 
                      searchData={message.formattedSearch} 
                      userQuery={message.userQuery}
                      content={message.content}
                    />
                  )}
                  
                  {/* Images section - only for assistant messages (fallback if no formatted search) */}
                  {message.role === "assistant" && !message.formattedSearch && message.images && message.images.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {message.images.map((image, idx) => (
                        image.thumbnail?.src ? (
                          <a
                            key={idx}
                            href={image.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={image.thumbnail.src}
                              alt={image.title || `Image ${idx + 1}`}
                              className="h-24 w-24 object-cover rounded border border-border/50 cursor-pointer"
                              loading="lazy"
                            />
                          </a>
                        ) : null
                      ))}
                    </div>
                  )}
                  {/* Watch section - videos for assistant messages (fallback if no formatted search) */}
                  {message.role === "assistant" && !message.formattedSearch && message.videos && message.videos.length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm text-muted-foreground mb-2 font-medium">Watch</div>
                      <div className="flex flex-wrap gap-2">
                        {message.videos.map((video, idx) => (
                          video.thumbnail?.src ? (
                            <a
                              key={idx}
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block hover:opacity-80 transition-opacity group relative"
                            >
                              <div className="relative">
                                <img
                                  src={video.thumbnail.src}
                                  alt={video.title || `Video ${idx + 1}`}
                                  className="h-32 w-48 object-cover rounded border border-border/50 cursor-pointer"
                                  loading="lazy"
                                />
                                {/* Play icon overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded">
                                  <svg
                                    className="w-8 h-8 text-white opacity-90"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                                {/* Duration badge */}
                                {video.duration && (
                                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                    {video.duration}
                                  </div>
                                )}
                              </div>
                              {video.title && (
                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2 max-w-[192px]">
                                  {video.title}
                                </div>
                              )}
                            </a>
                          ) : null
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Regular content (only show if no formatted search) */}
                  {message.content && !message.formattedSearch && (
                    <div className="space-y-2">
                      <div
                        data-message-id={message.id}
                        className={`break-words max-w-none ${
                          message.role === "user"
                            ? "text-base font-medium text-yellow-100 text-right"
                            : `text-[15px] text-foreground/90 text-left ${animationClass}`
                        }`}
                        style={{
                          lineHeight: "1.8",
                          whiteSpace: "pre-wrap",
                          wordSpacing: "normal",
                          letterSpacing: "0.01em",
                          textAlign: message.role === "user" ? "right" : "left",
                        }}
                      >
                        {formatMessageContent(
                          // Filter out "Imagen 4" or "Imagen" references and generation messages from content
                          message.content
                            .replace(/\bImagen\s*4\b/gi, '')
                            .replace(/\bImagen\b/gi, '')
                            .replace(/Generated\s+\d+\s+image\(s\)/gi, '')
                            .replace(/I've\s+generated\s+\d+\s+image/i, '')
                            .replace(/Here's?\s+the\s+generated\s+image/i, '')
                            .trim()
                        )}
                      </div>
                      {/* Timestamp - only for assistant */}
                      {message.role === "assistant" && (
                        <div className="flex items-center justify-between gap-3 mt-3">
                          <div className="text-xs text-muted-foreground/60">
                            {formatTimestamp(message.timestamp)}
                          </div>
                          {/* Action icons */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content);
                              }}
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Copy message"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                            </button>
                            {speakingMessageId === message.id ? (
                              <>
                                {isPaused ? (
                                  <button
                                    onClick={resumeSpeaking}
                                    className="p-1.5 hover:bg-muted rounded transition-colors"
                                    title="Resume"
                                  >
                                    <Play className="h-3.5 w-3.5 text-primary" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={pauseSpeaking}
                                    className="p-1.5 hover:bg-muted rounded transition-colors"
                                    title="Pause"
                                  >
                                    <Pause className="h-3.5 w-3.5 text-primary" />
                                  </button>
                                )}
                                <button
                                  onClick={stopSpeaking}
                                  className="p-1.5 hover:bg-muted rounded transition-colors"
                                  title="Stop speaking"
                                >
                                  <Volume2 className="h-3.5 w-3.5 text-primary opacity-50" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => speakMessage(message.id, message.content)}
                                className="p-1.5 hover:bg-muted rounded transition-colors"
                                title="Read aloud"
                              >
                                <Volume2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                              </button>
                            )}
                            <button
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Good response"
                            >
                              <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-green-500" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-muted rounded transition-colors"
                              title="Bad response"
                            >
                              <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Timestamp and actions for formatted search */}
                  {message.formattedSearch && (
                    <div className="flex items-center justify-between gap-3 mt-4">
                      <div className="text-xs text-muted-foreground/60">
                        {formatTimestamp(message.timestamp)}
                      </div>
                      {/* Action icons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                          }}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Copy message"
                        >
                          <Copy className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                        </button>
                        {speakingMessageId === message.id ? (
                          <button
                            onClick={stopSpeaking}
                            className="p-1.5 hover:bg-muted rounded transition-colors"
                            title="Stop speaking"
                          >
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                          </button>
                        ) : (
                          <button
                            onClick={() => speakMessage(message.id, message.content)}
                            className="p-1.5 hover:bg-muted rounded transition-colors"
                            title="Read aloud"
                          >
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
                          </button>
                        )}
                        <button
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-green-500" />
                        </button>
                        <button
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex justify-start mb-6">
                <div className="max-w-[85%]">
                  <ProcessingIndicator />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area - Sticky Footer */}
      <div className="flex-shrink-0 border-t border-background bg-background p-4">
        <div className="relative mx-auto max-w-5xl w-full space-y-2">
          {/* Attached PDFs - Only render on client to prevent hydration issues */}
          {isMounted && attachedPDFs.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {attachedPDFs.map((pdf, index) => {
                // Use a stable key based on PDF data to avoid hydration issues
                const pdfKey = pdf.data ? `${pdf.type}-${pdf.data.substring(0, 20)}-${index}` : `pdf-${index}`;
                return (
                  <div
                    key={pdfKey}
                    className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-xs"
                  >
                    <span className="truncate max-w-[150px]" title={pdf.displayName}>
                      {pdf.displayName || `PDF ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        const updated = attachedPDFs.filter((_, i) => i !== index);
                        setAttachedPDFs(updated);
                      }}
                      className="hover:text-destructive transition-colors shrink-0"
                      disabled={isLoading}
                      aria-label="Remove PDF"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Type your message..."
              className="min-h-[60px] max-h-[200px] resize-none pl-14 pr-20 py-3 leading-normal text-yellow-100 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5',
              }}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <ArrowUp
              onClick={() => handleSubmit()}
              className={`absolute top-1/2 -translate-y-1/2 left-3 h-6 w-6 text-orange-500 transition-opacity ${
                isLoading || (!input.trim() && attachedPDFs.length === 0)
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:opacity-80"
              }`}
            />
            <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
              {/* Browser feature disabled */}
              {/* <Button
                variant="ghost"
                size="icon"
                onClick={() => openBrowser("https://www.google.com", "Browser")}
                className="h-8 w-8 hover:bg-accent"
                title="Open Browser"
              >
                <Globe className="h-4 w-4" />
              </Button> */}
              <CommandsButton className="h-8 w-8 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-accent transition-all duration-200" />
              <PDFUploadIcon
                onPDFsChange={setAttachedPDFs}
                existingPDFs={attachedPDFs}
                maxFiles={5}
                uploading={uploadingPDFs}
                onUploadingChange={setUploadingPDFs}
              />
              <SignedIn>
                {!editorState.isOpen && <UserButton />}
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </div>
    {browserState.isOpen ? (
      browserState.sid ? (
        <BrowserPanel 
          sid={browserState.sid}
          allowExecute={true}
          onClose={closeBrowser}
        />
      ) : browserState.url ? (
        <BrowserViewer 
          url={browserState.url}
          title={browserState.title}
          onClose={closeBrowser}
        />
      ) : null
    ) : videoState.isOpen && videoState.videoUrl ? (
      <VideoViewer 
        videoUrl={videoState.videoUrl} 
        videoTitle={videoState.videoTitle}
        onClose={closeVideo} 
      />
    ) : imageState.isOpen && imageState.imageUrl ? (
      <ImageViewer imageUrl={imageState.imageUrl} onClose={closeImage} />
    ) : (
      <CodeMirrorEditor />
    )}
    </SplitView>
  );
}

