"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export interface EditorState {
  filePath: string | null;
  originalContent: string;
  currentContent: string;
  isOpen: boolean;
  hasUnsavedChanges: boolean;
}

export interface ImageState {
  imageUrl: string | null;
  isOpen: boolean;
}

export interface VideoState {
  videoUrl: string | null;
  videoTitle: string | null;
  isOpen: boolean;
}

export interface BrowserState {
  url: string | null;
  title: string | null;
  sid: string | null; // Session ID for browser service
  isOpen: boolean;
}

export type MobilePanelType = "chat" | "editor" | "image" | "video" | "browser" | "files";

interface WorkspaceContextType {
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  selectedPathType: "file" | "directory" | null;
  setSelectedPathType: (type: "file" | "directory" | null) => void;
  // Editor state
  editorState: EditorState;
  openFile: (path: string, content: string) => void;
  closeEditor: () => void;
  updateEditorContent: (content: string) => void;
  saveEditor: () => Promise<void>;
  // Image state
  imageState: ImageState;
  openImage: (imageUrl: string) => void;
  closeImage: () => void;
  // Video state
  videoState: VideoState;
  openVideo: (videoUrl: string, videoTitle?: string) => void;
  closeVideo: () => void;
  // Browser state
  browserState: BrowserState;
  openBrowser: (url: string, title?: string) => void;
  closeBrowser: () => void;
  // Mobile panel state
  activeMobilePanel: MobilePanelType;
  setActiveMobilePanel: (panel: MobilePanelType) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPathType, setSelectedPathType] = useState<"file" | "directory" | null>(null);

  // Mobile panel state - default to chat view
  const [activeMobilePanel, setActiveMobilePanel] = useState<MobilePanelType>("chat");

  // Editor state
  const [editorState, setEditorState] = useState<EditorState>({
    filePath: null,
    originalContent: '',
    currentContent: '',
    isOpen: false,
    hasUnsavedChanges: false,
  });

  // Image state
  const [imageState, setImageState] = useState<ImageState>({
    imageUrl: null,
    isOpen: false,
  });

  // Video state
  const [videoState, setVideoState] = useState<VideoState>({
    videoUrl: null,
    videoTitle: null,
    isOpen: false,
  });

  // Browser state
  const [browserState, setBrowserState] = useState<BrowserState>({
    url: null,
    title: null,
    sid: null,
    isOpen: false,
  });

  const openFile = useCallback((path: string, content: string) => {
    setEditorState({
      filePath: path,
      originalContent: content,
      currentContent: content,
      isOpen: true,
      hasUnsavedChanges: false,
    });
    // Also set as selected path so LLM knows about it
    setSelectedPath(path);
    setSelectedPathType("file");
    // Auto-switch to editor panel on mobile
    setActiveMobilePanel("editor");
  }, [setSelectedPath, setSelectedPathType]);

  const closeEditor = useCallback(() => {
    setEditorState(prev => ({
      ...prev,
      isOpen: false,
      filePath: null,
      originalContent: '',
      currentContent: '',
      hasUnsavedChanges: false,
    }));
  }, []);

  const updateEditorContent = useCallback((content: string) => {
    setEditorState(prev => ({
      ...prev,
      currentContent: content,
      hasUnsavedChanges: prev.originalContent !== content,
    }));
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editorState.filePath) return;
    
    try {
      const response = await fetch('/api/filesystem/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editorState.filePath,
          content: editorState.currentContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to save file (${response.status})`;
        throw new Error(errorMessage);
      }

      // Update original content to current content after save
      setEditorState(prev => ({
        ...prev,
        originalContent: prev.currentContent,
        hasUnsavedChanges: false,
      }));
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }, [editorState.filePath, editorState.currentContent]);

  const openImage = useCallback((imageUrl: string) => {
    setImageState({
      imageUrl,
      isOpen: true,
    });
    // Close editor when opening image
    setEditorState(prev => ({
      ...prev,
      isOpen: false,
    }));
    // Auto-switch to image panel on mobile
    setActiveMobilePanel("image");
  }, []);

  const closeImage = useCallback(() => {
    setImageState({
      imageUrl: null,
      isOpen: false,
    });
  }, []);

  const openVideo = useCallback((videoUrl: string, videoTitle?: string) => {
    setVideoState({
      videoUrl,
      videoTitle: videoTitle || null,
      isOpen: true,
    });
    // Close editor and image when opening video
    setEditorState(prev => ({
      ...prev,
      isOpen: false,
    }));
    setImageState(prev => ({
      ...prev,
      isOpen: false,
    }));
    // Auto-switch to video panel on mobile
    setActiveMobilePanel("video");
  }, []);

  const closeVideo = useCallback(() => {
    setVideoState({
      videoUrl: null,
      videoTitle: null,
      isOpen: false,
    });
  }, []);

  const openBrowser = useCallback(async (url: string, title?: string) => {
    try {
      console.log('[WorkspaceContext] Opening browser:', url);
      
      // Normalize URL - ensure it has a protocol
      let normalizedUrl = url.trim();
      if (!normalizedUrl.match(/^https?:\/\//i) && !normalizedUrl.startsWith('about:')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      
      // Try to create browser session (requires browser service)
      try {
        const sessionResponse = await fetch('/api/browser/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewport: { w: 1280, h: 800 } }),
        });

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          const sid = sessionData.sid;

          if (sid) {
            console.log('[WorkspaceContext] Browser session created:', sid);

            // Navigate to URL - wait a bit for session to be fully ready
            if (normalizedUrl && normalizedUrl !== 'about:blank') {
              await new Promise(resolve => setTimeout(resolve, 500));
              
              console.log('[WorkspaceContext] Navigating to URL:', normalizedUrl);
              const navigateResponse = await fetch('/api/browser/navigate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sid, url: normalizedUrl }),
              });

              if (navigateResponse.ok) {
                const navData = await navigateResponse.json().catch(() => ({}));
                console.log('[WorkspaceContext] Navigation successful', navData);
                
                // Update URL in state if navigation returned a URL
                if (navData.url) {
                  normalizedUrl = navData.url;
                }
              } else {
                console.warn('[WorkspaceContext] Navigation failed, using fallback');
              }
            }

            // Use BrowserPanel with session
            setBrowserState({
              url: normalizedUrl,
              title: title || null,
              sid,
              isOpen: true,
            });

            // Close other panels when opening browser
            setEditorState(prev => ({
              ...prev,
              isOpen: false,
            }));
            setImageState(prev => ({
              ...prev,
              isOpen: false,
            }));
            setVideoState(prev => ({
              ...prev,
              isOpen: false,
            }));
            // Auto-switch to browser panel on mobile
            setActiveMobilePanel("browser");
            return;
          }
        }
      } catch (error) {
        console.log('[WorkspaceContext] Browser service not available, using fallback:', error);
      }

      // Fallback to BrowserViewer (simple iframe) if service unavailable
      console.log('[WorkspaceContext] Using BrowserViewer fallback');
      setBrowserState({
        url: normalizedUrl,
        title: title || null,
        sid: null, // No session ID - will use BrowserViewer
        isOpen: true,
      });

      // Close other panels when opening browser
      setEditorState(prev => ({
        ...prev,
        isOpen: false,
      }));
      setImageState(prev => ({
        ...prev,
        isOpen: false,
      }));
      setVideoState(prev => ({
        ...prev,
        isOpen: false,
      }));
      // Auto-switch to browser panel on mobile
      setActiveMobilePanel("browser");
    } catch (error) {
      console.error('[WorkspaceContext] Error opening browser:', error);
      // Still open browser panel but show error
      setBrowserState({
        url,
        title: title || null,
        sid: null,
        isOpen: true,
      });
      // Auto-switch to browser panel on mobile even if error
      setActiveMobilePanel("browser");
    }
  }, []);

  const closeBrowser = useCallback(async () => {
    // Delete browser session if it exists
    if (browserState.sid) {
      try {
        await fetch(`/api/browser/sessions/${browserState.sid}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Error closing browser session:', error);
      }
    }

    setBrowserState({
      url: null,
      title: null,
      sid: null,
      isOpen: false,
    });
  }, [browserState.sid]);

  return (
    <WorkspaceContext.Provider value={{
      selectedPath,
      setSelectedPath,
      selectedPathType,
      setSelectedPathType,
      editorState,
      openFile,
      closeEditor,
      updateEditorContent,
      saveEditor,
      imageState,
      openImage,
      closeImage,
      videoState,
      openVideo,
      closeVideo,
      browserState,
      openBrowser,
      closeBrowser,
      activeMobilePanel,
      setActiveMobilePanel,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

