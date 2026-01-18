'use client';

import React from 'react';
import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorBanner({ message, onRetry, isRetrying }: ErrorBannerProps) {
  return (
    <div className={styles.banner}>
      <span className={styles.message}>⚠️ {message}</span>
      {onRetry && (
        <button
          className={styles.retryButton}
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? '重试中...' : '重试'}
        </button>
      )}
    </div>
  );
}
