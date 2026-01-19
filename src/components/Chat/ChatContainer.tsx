'use client';

import React, { useEffect, useRef, useState } from 'react';
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

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const prevLoadingRef = useRef(false);
  const statusLower = currentStatus?.toLowerCase() ?? '';
  const isBrowserActive = Boolean(
    (currentStatus && /(playwright|browserbase)/i.test(currentStatus))
    || (isLoading && (mcpMode === 'browserbase' || mcpMode === 'playwright' || mcpMode === 'playwright-mcp' || mcpMode === 'both'))
  );
  const previewLabel = statusLower.includes('browserbase')
    ? 'Browserbase'
    : statusLower.includes('playwright-mcp')
      ? 'Playwright MCP'
      : statusLower.includes('playwright')
        ? 'Playwright'
        : mcpMode === 'browserbase'
          ? 'Browserbase'
          : mcpMode === 'playwright-mcp'
            ? 'Playwright MCP'
            : mcpMode === 'playwright'
              ? 'Playwright'
              : 'Browser';
  const previewStatus = currentStatus
    || (isLoading
      ? `Preparing ${previewLabel} session...`
      : (screenshot ? `${previewLabel} session complete.` : 'No active browser session.'));
  const [hadBrowserActivity, setHadBrowserActivity] = useState(false);

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
  };

  const today = new Date();
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const addDays = (base: Date, days: number) => {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
  };

  const suggestions = [
    {
      title: "Find listings",
      text: `Find a 2-bedroom apartment in Tokyo. Check-in ${formatDate(addDays(today, 14))}, check-out ${formatDate(addDays(today, 17))}, 2 guests, budget USD 140-220 per night.`
    },
    {
      title: "City stay",
      text: `Find a stylish apartment in Paris. Check-in ${formatDate(addDays(today, 21))}, check-out ${formatDate(addDays(today, 25))}, 2 guests, budget EUR 180-280 per night.`
    },
    {
      title: "Beachfront",
      text: `Find beachfront villas in Bali. Check-in ${formatDate(addDays(today, 28))}, check-out ${formatDate(addDays(today, 32))}, 4 guests, budget USD 220-350 per night.`
    },
    {
      title: "Budget search",
      text: `Find listings in New York City. Check-in ${formatDate(addDays(today, 18))}, check-out ${formatDate(addDays(today, 21))}, 2 guests, budget USD 80-120 per night.`
    }
  ];

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    if (!wasLoading && isLoading) {
      setPreviewDismissed(false);
      setHadBrowserActivity(false);
    }
    if (wasLoading && !isLoading && hadBrowserActivity) {
      setIsPreviewOpen(false);
      setPreviewDismissed(true);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, hadBrowserActivity]);

  useEffect(() => {
    if (screenshot || isBrowserActive) {
      setHadBrowserActivity(true);
    }
  }, [screenshot, isBrowserActive]);

  useEffect(() => {
    if (previewDismissed) return;
    if (screenshot || isBrowserActive) {
      setIsPreviewOpen(true);
    }
  }, [previewDismissed, screenshot, isBrowserActive]);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
        setPreviewDismissed(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewDismissed(true);
  };

  return (
    <div className={styles.chatContainer}>
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

            <div className={styles.modeControl}>
              <select
                id="mcp-mode"
                aria-label="Search mode"
                className={styles.modeSelect}
                value={mcpMode}
                onChange={(event) => setMcpMode(event.target.value as MCPMode)}
                disabled={isLoading}
                title="Search Mode"
              >
                <option value="playwright">Playwright</option>
                <option value="playwright-mcp">Playwright MCP</option>
                <option value="browserbase">Browserbase</option>
                <option value="both">A/B (Both)</option>
              </select>
            </div>

            <div className={styles.modelControl}>
              <select
                id="model-select"
                aria-label="AI model"
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
                  <button
                    key={i}
                    type="button"
                    className={styles.suggestionCard}
                    onClick={() => handleSuggestionClick(s.text)}
                  >
                    <div className={styles.suggestionTitle}>{s.title}</div>
                    <div className={styles.suggestionText}>{s.text}</div>
                  </button>
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

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <InputBar
            onSend={sendMessage}
            disabled={isLoading}
            placeholder={isLoading ? 'Agent is working...' : 'Ask about listings, locations, or prices...'}
          />
        </div>
      </div>

      {isPreviewOpen && (
        <div className={styles.previewDialogBackdrop}>
          <div
            className={styles.previewDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="browser-preview-title"
            aria-describedby="browser-preview-status"
          >
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                <span id="browser-preview-title">{previewLabel} Live View</span>
                <span className={isLoading ? styles.previewBadgeLive : styles.previewBadgeIdle}>
                  {isLoading ? 'LIVE' : 'IDLE'}
                </span>
              </div>
              <span
                id="browser-preview-status"
                className={styles.previewStatusText}
                aria-live="polite"
                aria-atomic="true"
              >
                {previewStatus}
              </span>
              <div className={styles.previewActions}>
                <button type="button" className={styles.previewClose} onClick={handleClosePreview}>
                  Close
                </button>
              </div>
            </div>
            <div className={styles.previewContent}>
              {screenshot ? (
                <img
                  src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
                  alt="Browser Screenshot"
                  width={1280}
                  height={800}
                  className={styles.screenshot}
                />
              ) : (
                <div className={styles.previewPlaceholder}>
                  {isLoading ? (
                    <>
                      <div className={styles.loadingPulse} />
                      <p>{previewStatus}</p>
                      <p className={styles.previewSubtext}>Capturing screenshots shortly...</p>
                    </>
                  ) : (
                    <>
                      <p>No Active Session</p>
                      <p className={styles.previewSubtext}>Send a message to start browsing.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
