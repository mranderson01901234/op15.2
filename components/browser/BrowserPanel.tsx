'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, RefreshCw, Home, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BrowserPanelProps {
  sid: string;
  serviceUrl?: string;
  allowExecute?: boolean;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export default function BrowserPanel({
  sid,
  serviceUrl = '/api/browser',
  allowExecute = false,
  onError,
  onClose,
}: BrowserPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameQueueRef = useRef<Array<{ data: string; timestamp: number }>>([]);
  const isProcessingFrameRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const [url, setUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    if (!sid) {
      console.warn('[BrowserPanel] No session ID provided');
      return;
    }

    // Extract WebSocket URL from service URL or use env var
    let wsUrl: string;
    if (typeof window !== 'undefined') {
      // Get from environment variable or default
      const envUrl = process.env.NEXT_PUBLIC_BROWSER_SERVICE_URL;
      if (envUrl) {
        // Convert http/https to ws/wss
        wsUrl = envUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
      } else {
        wsUrl = 'ws://localhost:7071';
      }
      wsUrl = wsUrl + '/rtc';
    } else {
      wsUrl = 'ws://localhost:7071/rtc';
    }
    
    const fullWsUrl = `${wsUrl}?sid=${sid}`;
    console.log('[BrowserPanel] Connecting to WebSocket:', {
      url: fullWsUrl,
      sid: sid,
      envVar: process.env.NEXT_PUBLIC_BROWSER_SERVICE_URL,
    });
    
    // Verify session exists before connecting
    const verifyAndConnect = async () => {
      try {
        // Check if session exists by trying to read it
        const checkResponse = await fetch(`${serviceUrl}/read?sid=${sid}&mode=raw&maxChars=1`);
        if (!checkResponse.ok && checkResponse.status === 404) {
          console.error('[BrowserPanel] Session not found:', sid);
          setError(`Browser session not found. Please try opening the browser again.`);
          return;
        }
        
        console.log('[BrowserPanel] Session verified, connecting WebSocket...');
        const ws = new WebSocket(fullWsUrl);

        ws.onopen = () => {
          console.log('[BrowserPanel] WebSocket connected successfully');
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0; // Reset reconnect attempts
          
          // Start ping/pong keepalive
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
              } catch (err) {
                console.error('[BrowserPanel] Ping failed:', err);
              }
            }
          }, 30000); // Ping every 30 seconds
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            // Handle pong response
            if (message.type === 'pong') {
              return; // Just acknowledge, no processing needed
            }
            
            // Remove verbose logging for frames to reduce overhead
            // Only log non-frame messages
            if (message.type !== 'frame') {
              console.log('[BrowserPanel] Received message:', message.type);
            }
            
            if (message.type === 'frame' && canvasRef.current) {
              // Throttle frames - only process if enough time has passed (target ~15fps)
              const now = Date.now();
              const timeSinceLastFrame = now - lastFrameTimeRef.current;
              const minFrameInterval = 1000 / 15; // ~15fps max
              
              if (timeSinceLastFrame < minFrameInterval) {
                // Queue frame for later processing
                frameQueueRef.current.push({ data: message.data, timestamp: now });
                return;
              }
              
              // Process frame immediately
              processFrame(message.data);
              lastFrameTimeRef.current = now;
              
              // Process queued frames if any
              if (frameQueueRef.current.length > 0 && !isProcessingFrameRef.current) {
                processQueuedFrames();
              }
            } else if (message.type === 'url') {
              setUrl(message.url || '');
            } else if (message.type === 'navigation') {
              setCanGoBack(message.canGoBack || false);
              setCanGoForward(message.canGoForward || false);
            }
          } catch (err) {
            console.error('[BrowserPanel] Error processing message:', err);
          }
        };
        
        // Process a single frame
        const processFrame = (frameData: string) => {
          if (!canvasRef.current || isProcessingFrameRef.current) return;
          
          isProcessingFrameRef.current = true;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            const img = new Image();
            img.onload = () => {
              // Use requestAnimationFrame for smooth rendering
              requestAnimationFrame(() => {
                if (canvasRef.current && ctx) {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0);
                }
                isProcessingFrameRef.current = false;
              });
            };
            img.onerror = () => {
              console.error('[BrowserPanel] Image load error');
              isProcessingFrameRef.current = false;
            };
            img.src = `data:image/png;base64,${frameData}`;
          } else {
            isProcessingFrameRef.current = false;
          }
        };
        
        // Process queued frames (only latest)
        const processQueuedFrames = () => {
          if (frameQueueRef.current.length === 0 || isProcessingFrameRef.current) return;
          
          // Only process the latest frame, drop older ones
          const latestFrame = frameQueueRef.current[frameQueueRef.current.length - 1];
          frameQueueRef.current = []; // Clear queue
          
          const now = Date.now();
          const timeSinceLastFrame = now - lastFrameTimeRef.current;
          const minFrameInterval = 1000 / 15;
          
          if (timeSinceLastFrame >= minFrameInterval) {
            processFrame(latestFrame.data);
            lastFrameTimeRef.current = now;
          } else {
            // Schedule for later
            setTimeout(() => {
              processFrame(latestFrame.data);
              lastFrameTimeRef.current = Date.now();
            }, minFrameInterval - timeSinceLastFrame);
          }
        };

        ws.onerror = (err) => {
          // Extract useful information from the error event
          const errorInfo: Record<string, any> = {
            readyState: ws.readyState,
            readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] || 'UNKNOWN',
            url: fullWsUrl,
            sid: sid,
            timestamp: new Date().toISOString(),
          };
          
          // Try to extract more info from the event object
          if (err && typeof err === 'object') {
            errorInfo.errorType = err.type || 'unknown';
            errorInfo.errorTarget = err.target ? {
              readyState: (err.target as WebSocket)?.readyState,
              url: (err.target as WebSocket)?.url,
            } : null;
          }
          
          // Check if this is a connection failure
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            errorInfo.connectionFailed = true;
            errorInfo.suggestion = 'WebSocket failed to connect. Check if browser service is running and accessible.';
          }
          
          console.error('[BrowserPanel] WebSocket error:', errorInfo);
          
          const errorMessage = ws.readyState === WebSocket.CLOSED 
            ? `WebSocket connection failed. Check if browser service is running on ${fullWsUrl.split('?')[0]}.`
            : `WebSocket connection error (state: ${errorInfo.readyStateText}).`;
          
          setError(errorMessage);
          onError?.(new Error(`WebSocket connection error: ${errorInfo.readyStateText}`));
        };

        ws.onclose = (event) => {
          console.log('[BrowserPanel] WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          
          // Clear ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          
          setIsConnected(false);
          
          // Don't reconnect if it was a clean close or invalid session
          if (event.code === 1000 || event.code === 1008) {
            if (event.code === 1008) {
              setError(`WebSocket rejected: ${event.reason || 'Invalid session ID'}`);
            }
            return;
          }
          
          // Attempt reconnection with exponential backoff
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000); // Max 30s
          
          console.log(`[BrowserPanel] Attempting reconnection in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          setError(`Connection lost. Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            verifyAndConnect();
          }, delay);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('[BrowserPanel] Error verifying session:', err);
        setError(`Failed to verify browser session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    
    // Add a small delay to ensure session is ready, then verify and connect
    const connectTimeout = setTimeout(verifyAndConnect, 200);

    return () => {
      clearTimeout(connectTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
      // Clear frame queue
      frameQueueRef.current = [];
    };
  }, [sid, serviceUrl, onError]);

  const handleNavigate = async (targetUrl?: string) => {
    const urlToNavigate = targetUrl || url;
    if (!urlToNavigate) return;

    // Normalize URL - ensure it has a protocol
    let normalizedUrl = urlToNavigate.trim();
    if (!normalizedUrl.match(/^https?:\/\//i) && !normalizedUrl.startsWith('about:')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      const response = await fetch(`${serviceUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, url: normalizedUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Navigation failed');
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
      onError?.(err);
    }
  };

  const handleBack = async () => {
    try {
      const response = await fetch(`${serviceUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, action: 'back' }),
      });
      if (!response.ok) throw new Error('Back navigation failed');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleForward = async () => {
    try {
      const response = await fetch(`${serviceUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, action: 'forward' }),
      });
      if (!response.ok) throw new Error('Forward navigation failed');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRefresh = async () => {
    try {
      const response = await fetch(`${serviceUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, action: 'refresh' }),
      });
      if (!response.ok) throw new Error('Refresh failed');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleInput = async (events: any[]) => {
    if (!allowExecute) {
      setError('Input requires allowExecute=true');
      return;
    }

    try {
      const response = await fetch(`${serviceUrl}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, events }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Input failed');
      }
    } catch (err: any) {
      setError(err.message);
      onError?.(err);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!allowExecute || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    handleInput([
      {
        type: 'click',
        x: Math.round(x),
        y: Math.round(y),
        button: 'left',
      },
    ]);
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!allowExecute) return;

    handleInput([
      {
        type: 'scroll',
        deltaY: e.deltaY,
      },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  return (
    <div className="relative w-full h-full bg-background flex flex-col">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-background z-50 relative flex-shrink-0">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            disabled={!canGoBack}
            className="h-7 w-7"
            title="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleForward}
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
            onClick={() => handleNavigate('about:blank')}
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
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs"
            placeholder="Enter URL..."
          />
        </div>

        {/* Connection Status & Close */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isConnected ? (
            <span className="h-2 w-2 rounded-full bg-green-500" title="Connected" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-red-500" title="Disconnected" />
          )}
          {onClose && (
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-border flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Browser Content */}
      <div className="flex-1 overflow-hidden relative bg-black">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onWheel={handleCanvasWheel}
          className={cn(
            "w-full h-full object-contain",
            allowExecute && "cursor-pointer"
          )}
        />
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2" />
            <p className="text-sm">Connecting to browser service...</p>
          </div>
        )}
      </div>
    </div>
  );
}

