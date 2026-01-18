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
      >
        <span className={styles.title}>🛠️ {toolCall.name}</span>
        <span className={`${styles.icon} ${isExpanded ? styles.expanded : ''}`}>▼</span>
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
