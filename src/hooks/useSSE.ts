'use client';

import { useCallback, useRef } from 'react';

interface UseSSEOptions {
  onMessage: (data: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  events?: Record<string, (data: string) => void>;
}

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const isCompletedRef = useRef<boolean>(false);

  const connect = useCallback((url: string, options: UseSSEOptions) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    isCompletedRef.current = false;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    const eventHandlers = options.events || {};
    const attachedEvents = Object.entries(eventHandlers).map(([event, handler]) => {
      const listener = (message: MessageEvent) => {
        handler(message.data);
      };
      eventSource.addEventListener(event, listener);
      return { event, listener };
    });

    eventSource.onmessage = (event) => {
      try {
        const data = event.data;
        if (data === '[DONE]') {
          isCompletedRef.current = true;
          options.onComplete?.();
          // Small delay before closing to ensure all messages are processed
          setTimeout(() => {
            if (eventSourceRef.current === eventSource) {
              eventSource.close();
              eventSourceRef.current = null;
            }
          }, 100);
          return;
        }
        options.onMessage(data);
      } catch (error) {
        options.onError?.(error as Error);
      }
    };

    eventSource.onerror = () => {
      // Ignore errors if already completed (normal closure)
      if (isCompletedRef.current) {
        return;
      }

      // EventSource.readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
      // If connection is closed, check if it was a normal closure or error
      if (eventSource.readyState === EventSource.CLOSED) {
        // Connection closed - could be normal closure or error
        // If we reached here without receiving [DONE], it's likely an error
        // But wait a bit to see if [DONE] is still coming
        setTimeout(() => {
          if (!isCompletedRef.current && eventSourceRef.current === eventSource) {
            // Still not completed, treat as error
            options.onError?.(new Error('SSE connection closed unexpectedly'));
            eventSourceRef.current = null;
          }
        }, 200);
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        // Connection is reconnecting, this is normal and not an error
        // EventSource will automatically retry
        return;
      }
      // For OPEN state errors, let EventSource handle reconnection
    };

    return () => {
      for (const { event, listener } of attachedEvents) {
        eventSource.removeEventListener(event, listener);
      }
      eventSource.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return { connect, disconnect };
}
