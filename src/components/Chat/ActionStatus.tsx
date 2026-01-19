'use client';

import React, { memo } from 'react';
import styles from './ActionStatus.module.css';

interface ActionStatusProps {
  status: string | null;
}

export const ActionStatus = memo(function ActionStatus({ status }: ActionStatusProps) {
  if (!status) return null;

  return (
    <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.dot} />
      <span className={styles.text}>{status}</span>
    </div>
  );
});
