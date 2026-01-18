'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/types/chat';
import { useSSE } from './useSSE';

const MAX_HISTORY_ROUNDS = 10;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connect, disconnect } = useSSE();
  const cleanupRef = useRef<(() => void) | null>(null);

  const addMessage = useCallback((role: 'user' | 'assistant' | 'system', content: string, metadata?: ChatMessage['metadata']) => {
    const message: ChatMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    setMessages(prev => [...prev, message]);
    return message;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message
    addMessage('user', content);

    // Prepare assistant message placeholder
    const assistantMessageId = uuidv4();
    const assistantContentRef = { current: '' };

    try {
      // Get recent history using functional state update
      let recentMessages: ChatMessage[] = [];
      setMessages(prev => {
        recentMessages = prev.slice(-MAX_HISTORY_ROUNDS * 2);
        return prev;
      });

      // Build query params
      const params = new URLSearchParams({
        message: content,
        history: JSON.stringify(recentMessages)
      });

      // Connect to SSE endpoint and store cleanup function
      const cleanup = connect(`/api/chat?${params.toString()}`, {
        onMessage: (data) => {
          assistantContentRef.current += data;
          setMessages(prev => {
            const existing = prev.find(m => m.id === assistantMessageId);
            if (existing) {
              return prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: assistantContentRef.current }
                  : m
              );
            } else {
              return [...prev, {
                id: assistantMessageId,
                role: 'assistant' as const,
                content: assistantContentRef.current,
                timestamp: Date.now()
              }];
            }
          });
        },
        events: {
          results: (data) => {
            try {
              const metadata = JSON.parse(data) as ChatMessage['metadata'];
              setMessages(prev => {
                const existing = prev.find(m => m.id === assistantMessageId);
                if (existing) {
                  return prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, metadata: { ...existing.metadata, ...metadata } }
                      : m
                  );
                }
                return [...prev, {
                  id: assistantMessageId,
                  role: 'assistant' as const,
                  content: assistantContentRef.current,
                  timestamp: Date.now(),
                  metadata
                }];
              });
            } catch (parseError) {
              console.error('Failed to parse results event', parseError);
            }
          },
          'server-error': (data) => {
            try {
              const payload = JSON.parse(data) as { error?: string };
              setError(payload.error || 'Server error occurred');
            } catch (parseError) {
              setError('Server error occurred');
              console.error('Failed to parse server error event', parseError);
            } finally {
              setIsLoading(false);
            }
          }
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
          cleanupRef.current = null;
        },
        onComplete: () => {
          setIsLoading(false);
          cleanupRef.current = null;
        }
      });
      cleanupRef.current = cleanup;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsLoading(false);
    }
  }, [isLoading, addMessage, connect]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    disconnect
  };
}
