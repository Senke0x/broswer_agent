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

  const connect = useCallback((url: string, options: UseSSEOptions) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

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

    eventSource.onerror = () => {
      options.onError?.(new Error('SSE connection error'));
      eventSource.close();
      eventSourceRef.current = null;
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
