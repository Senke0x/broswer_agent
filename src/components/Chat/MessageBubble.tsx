'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/types/chat';
import { ToolCall } from './ToolCall';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp } = message;
  const isUser = role === 'user';
  const isSystem = role === 'system';

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`${styles.messageWrapper} ${isUser ? styles.userWrapper : styles.assistantWrapper}`}>
      {role === 'assistant' && (
        <div className={styles.agentLabel}>
          <div className={styles.agentIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" fill="none"/>
            </svg>
          </div>
          <span className={styles.agentText}>Browser Agent</span>
        </div>
      )}

      <div className={styles.messageContainer}>
        <div className={`${styles.bubble} ${styles[role]}`}>
          {isSystem && <div className={styles.systemLabel}>系统消息</div>}

          {role === 'assistant' && message.metadata?.toolCalls && message.metadata.toolCalls.length > 0 && (
            <div className={styles.toolCalls}>
              {message.metadata.toolCalls.map((tc, i) => (
                <ToolCall key={i} toolCall={tc} />
              ))}
            </div>
          )}

          <div className={styles.content}>
            {role === 'assistant' ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({children}) => <p className={styles.paragraph}>{children}</p>,
                  ul: ({children}) => <ul className={styles.list}>{children}</ul>,
                  ol: ({children}) => <ol className={styles.list}>{children}</ol>,
                  li: ({children}) => <li className={styles.listItem}>{children}</li>,
                  a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>{children}</a>,
                  code: ({children}) => <code className={styles.code}>{children}</code>,
                }}
              >
                {content}
              </ReactMarkdown>
            ) : (
              <span className={styles.plainText}>{content}</span>
            )}
          </div>
        </div>
        <div className={styles.timestamp} title={formatTime(timestamp)}>{formatTime(timestamp)}</div>
      </div>
    </div>
  );
}
