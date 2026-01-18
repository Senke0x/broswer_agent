'use client';

import React, { useState } from 'react';
import { ToolCall as ToolCallType } from '@/types/chat';
import styles from './ToolCall.module.css';

interface ToolCallProps {
  toolCall: ToolCallType;
}

export function ToolCall({ toolCall }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={styles.container}>
      <div
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <span className={styles.title}>
          <span className={styles.toolIcon}>⚡</span>
          {toolCall.name}
        </span>
        <div className={styles.status}>
          <span className={styles.statusDot} />
          <span>已完成</span>
          <span className={`${styles.icon} ${isExpanded ? styles.expanded : ''}`}>▼</span>
        </div>
      </div>
      {isExpanded && (
        <div className={styles.body}>
          <pre className={styles.code}>
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
