'use client';

import React from 'react';
import { ChatMessage } from '@/types/chat';
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
        <div className={styles.content}>{content}</div>
        <div className={styles.timestamp}>{formatTime(timestamp)}</div>
      </div>
    </div>
  );
}
