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
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`${styles.messageWrapper} ${isUser ? styles.userWrapper : styles.assistantWrapper}`}>
      <div className={`${styles.bubble} ${styles[role]}`}>
        {isSystem && <div className={styles.systemLabel}>System</div>}
        
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
        <div className={styles.timestamp}>{formatTime(timestamp)}</div>
      </div>
    </div>
  );
}
