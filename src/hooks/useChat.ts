'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/types/chat';
import type { MCPMode } from '@/types/mcp';
import { useSSE } from './useSSE';

const MAX_HISTORY_ROUNDS = 10;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mcpMode, setMcpMode] = useState<MCPMode>('playwright');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const { connect, disconnect } = useSSE();
  const cleanupRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  const addMessage = useCallback((role: 'user' | 'assistant' | 'system', content: string, metadata?: ChatMessage['metadata']) => {
    const message: ChatMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    setMessages(prev => {
      const next = [...prev, message];
      messagesRef.current = next;
      return next;
    });
    return message;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setCurrentStatus(null);
    setIsLoading(true);

    // Add user message
    addMessage('user', content);

    // Prepare assistant message placeholder
    const assistantMessageId = uuidv4();
    const assistantContentRef = { current: '' };

    try {
      const recentMessages = messagesRef.current.slice(-MAX_HISTORY_ROUNDS * 2);

      // Build query params
      const params = new URLSearchParams({
        message: content,
        history: JSON.stringify(recentMessages),
        mode: mcpMode,
        ...(selectedModel && { model: selectedModel })
      });

      // Connect to SSE endpoint and store cleanup function
      const cleanup = connect(`/api/chat?${params.toString()}`, {
        onMessage: (data) => {
          assistantContentRef.current += data;
          setMessages(prev => {
            const existing = prev.find(m => m.id === assistantMessageId);
            const next = existing
              ? prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: assistantContentRef.current }
                    : m
                )
              : [...prev, {
                  id: assistantMessageId,
                  role: 'assistant' as const,
                  content: assistantContentRef.current,
                  timestamp: Date.now()
                }];
            messagesRef.current = next;
            return next;
          });
        },
        events: {
          status: (data) => {
            setCurrentStatus(data);
          },
          results: (data) => {
            try {
              const metadata = JSON.parse(data) as ChatMessage['metadata'];
              setMessages(prev => {
                const existing = prev.find(m => m.id === assistantMessageId);
                const next = existing
                  ? prev.map(m =>
                      m.id === assistantMessageId
                        ? { ...m, metadata: { ...existing.metadata, ...metadata } }
                        : m
                    )
                  : [...prev, {
                      id: assistantMessageId,
                      role: 'assistant' as const,
                      content: assistantContentRef.current,
                      timestamp: Date.now(),
                      metadata
                    }];
                messagesRef.current = next;
                return next;
              });
            } catch (parseError) {
              console.error('Failed to parse results event', parseError);
            }
          },
          'server-error': (data) => {
            try {
              const payload = JSON.parse(data) as { error?: string; retryAfter?: number };
              let message = payload.error || 'Server error occurred';
              if (payload.retryAfter) {
                message = `${message} Try again in ${payload.retryAfter}s.`;
              }
              setError(message);
            } catch (parseError) {
              setError('Server error occurred');
              console.error('Failed to parse server error event', parseError);
            } finally {
              setIsLoading(false);
              setCurrentStatus(null);
              if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
              }
            }
          }
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
          setCurrentStatus(null);
          if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
          }
        },
        onComplete: () => {
          setIsLoading(false);
          setCurrentStatus(null);
          if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
          }
        }
      });
      cleanupRef.current = cleanup;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsLoading(false);
      setCurrentStatus(null);
    }
  }, [isLoading, addMessage, connect, mcpMode, selectedModel]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setError(null);
    setCurrentStatus(null);
  }, []);

  const retry = useCallback(() => {
    const lastUserMessage = messagesRef.current.slice().reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      sendMessage(lastUserMessage.content);
    }
  }, [sendMessage]);

  const fetchModels = useCallback(async () => {
    setIsFetchingModels(true);
    setError(null);
    try {
      const response = await fetch('/api/models');
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data = await response.json();
      const models = data.models || [];
      setAvailableModels(models);
      
      // Use functional update or check current value outside to avoid dependency loop
      // But for simplicity in this case, we just check if it's there
      if (models.length > 0 && !models.includes(selectedModel)) {
        setSelectedModel(models[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsFetchingModels(false);
    }
  }, [selectedModel]);

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
    currentStatus,
    error,
    sendMessage,
    retry,
    clearMessages,
    mcpMode,
    setMcpMode,
    disconnect,
    selectedModel,
    setSelectedModel,
    availableModels,
    fetchModels,
    isFetchingModels,
  };
}
