'use client';

import React, { useState } from 'react';
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
    screenshot,
  } = useChat();

  const [showPreview, setShowPreview] = useState(false);

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
  };

  const suggestions = [
    { title: "Find listings", text: "Find a 2-bedroom apartment in Tokyo for next weekend." },
    { title: "Compare prices", text: "Compare Airbnb prices in Paris vs London for July." },
    { title: "Check availability", text: "Check for available beachfront villas in Bali." },
    { title: "Budget search", text: "Find listings under $100/night in New York City." }
  ];

  return (
    <div className={`${styles.chatContainer} ${showPreview ? styles.hasPreview : ''}`}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.headerTitle}>
            <span>Browser Agent</span>
            <span style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>v1.0</span>
          </div>

          <div className={styles.controls}>
            <button
              className={styles.fetchButton}
              onClick={fetchModels}
              disabled={isLoading || isFetchingModels}
              title="Fetch available models"
            >
               {isFetchingModels ? 'Fetching...' : 'Fetch Models'}
            </button>

             <button
              className={styles.fetchButton}
              onClick={() => setShowPreview(!showPreview)}
              title="Toggle Browser Preview"
            >
              {showPreview ? 'Hide Browser' : 'Show Browser'}
            </button>

            <div className={styles.modeControl}>
              <select
                id="mcp-mode"
                className={styles.modeSelect}
                value={mcpMode}
                onChange={(event) => setMcpMode(event.target.value as MCPMode)}
                disabled={isLoading}
                title="Search Mode"
              >
                <option value="playwright">Playwright</option>
                <option value="browserbase">Browserbase</option>
                <option value="both">A/B (Both)</option>
              </select>
            </div>

            <div className={styles.modelControl}>
              <select
                id="model-select"
                className={styles.modeSelect}
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={isLoading}
                title="AI Model"
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
        <div className={styles.messageListWrapper}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <h2 style={{ marginBottom: '1rem', fontWeight: 600 }}>What can I do for you?</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                I can browse Airbnb, compare listings, and find the best deals for you.
              </p>

              <div className={styles.suggestionGrid}>
                {suggestions.map((s, i) => (
                  <div key={i} className={styles.suggestionCard} onClick={() => handleSuggestionClick(s.text)}>
                    <div className={styles.suggestionTitle}>{s.title}</div>
                    <div className={styles.suggestionText}>{s.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <MessageList messages={messages} isLoading={isLoading} currentStatus={currentStatus} />
          )}

          {error && (
            <ErrorBanner
              message={error}
              onRetry={retry}
              isRetrying={isLoading}
            />
          )}
        </div>
      </div>

      <div className={styles.previewPanel}>
        <div className={styles.previewHeader}>
          <span>Browser Preview</span>
          <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'var(--color-border)', borderRadius: '4px' }}>{mcpMode.toUpperCase()}</span>
        </div>
        <div className={styles.previewContent}>
          {screenshot ? (
            <img
              src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
              alt="Browser Screenshot"
              className={styles.screenshot}
            />
          ) : (
            <div className={styles.previewPlaceholder}>
              {isLoading ? (
                <>
                  <div className={styles.loadingPulse} />
                  <p>Initializing Browser Session...</p>
                  <p style={{ fontSize: '12px', marginTop: '8px' }}>Capturing screenshots shortly...</p>
                </>
              ) : (
                <>
                  <p>No Active Session</p>
                  <p style={{ fontSize: '12px', marginTop: '8px' }}>Send a message to start browsing</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <InputBar
            onSend={sendMessage}
            disabled={isLoading}
            placeholder={isLoading ? 'Agent is working...' : 'Ask about listings, locations, or prices...'}
          />
        </div>
      </div>
    </div>
  );
}