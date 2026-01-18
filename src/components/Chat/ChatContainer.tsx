'use client';

import React from 'react';
import { useChat } from '@/hooks/useChat';
import type { MCPMode } from '@/types/mcp';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import styles from './ChatContainer.module.css';

export function ChatContainer() {
  const { messages, isLoading, error, sendMessage, mcpMode, setMcpMode } = useChat();

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
          <MessageList messages={messages} isLoading={isLoading} />
        )}
      </div>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <InputBar
        onSend={sendMessage}
        disabled={isLoading}
        placeholder={isLoading ? 'Searching...' : 'Ask about Airbnb listings...'}
      />
    </div>
  );
}
