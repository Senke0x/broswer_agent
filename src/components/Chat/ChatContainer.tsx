'use client';

import React from 'react';
import { useChat } from '@/hooks/useChat';
import type { MCPMode } from '@/types/mcp';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import { ErrorBanner } from './ErrorBanner';
import styles from './ChatContainer.module.css';

export function ChatContainer() {
  const {
    messages,
    isLoading,
    currentStatus,
    error,
    sendMessage,
    retry,
    mcpMode,
    setMcpMode,
    selectedModel,
    setSelectedModel,
    availableModels,
    fetchModels,
    isFetchingModels,
  } = useChat();

  return (
    <div className={styles.chatContainer}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Airbnb Search Agent</h1>
            <p className={styles.subtitle}>
              Search for Airbnb listings using natural language
            </p>
          </div>
          <div className={styles.controls}>
            <div className={styles.modeControl}>
              <label className={styles.modeLabel} htmlFor="mcp-mode">
                Search mode
              </label>
              <select
                id="mcp-mode"
                className={styles.modeSelect}
                value={mcpMode}
                onChange={(event) => setMcpMode(event.target.value as MCPMode)}
                disabled={isLoading}
              >
                <option value="playwright">Playwright</option>
                <option value="browserbase">Browserbase</option>
                <option value="both">A/B (Both)</option>
              </select>
            </div>
            <div className={styles.modelControl}>
              <button
                className={styles.fetchButton}
                onClick={fetchModels}
                disabled={isFetchingModels || isLoading}
                title="Fetch available models"
              >
                {isFetchingModels ? 'Fetching...' : 'Fetch Models'}
              </button>
              <label className={styles.modeLabel} htmlFor="model-select">
                Model
              </label>
              <select
                id="model-select"
                className={styles.modeSelect}
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={isLoading}
              >
                {availableModels.length === 0 ? (
                  <option value={selectedModel}>{selectedModel} (default)</option>
                ) : (
                  availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.chatArea}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Start a conversation by asking about Airbnb listings</p>
            <p className={styles.example}>
              Example: &quot;Find me a place in Tokyo for next weekend&quot;
            </p>
          </div>
        ) : (
          <MessageList messages={messages} isLoading={isLoading} currentStatus={currentStatus} />
        )}
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={retry}
          isRetrying={isLoading}
        />
      )}

      <InputBar
        onSend={sendMessage}
        disabled={isLoading}
        placeholder={isLoading ? 'Searching...' : 'Ask about Airbnb listings...'}
      />
    </div>
  );
}
