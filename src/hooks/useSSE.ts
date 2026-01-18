'use client';

import { useCallback, useRef } from 'react';

interface UseSSEOptions {
  onMessage: (data: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback((url: string, options: UseSSEOptions) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = event.data;
        if (data === '[DONE]') {
          options.onComplete?.();
          eventSource.close();
          eventSourceRef.current = null;
          return;
        }
        options.onMessage(data);
      } catch (error) {
        options.onError?.(error as Error);
      }
    };

    eventSource.onerror = (error) => {
      options.onError?.(new Error('SSE connection error'));
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
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
