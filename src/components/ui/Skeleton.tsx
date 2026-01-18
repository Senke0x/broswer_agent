// Loading skeleton component for better UX

'use client';

import React, { useEffect } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = 'var(--radius-sm)',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}

// Skeleton variants for common use cases
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="14px"
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        padding: 'var(--spacing-md)',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Skeleton height="180px" borderRadius="var(--radius-md)" />
      <Skeleton height="20px" width="80%" />
      <Skeleton height="28px" width="40%" />
      <SkeletonText lines={2} />
    </div>
  );
}

// Hook to inject skeleton styles
export function useSkeletonStyles() {
  useEffect(() => {
    const styleId = 'skeleton-styles';
    if (document.getElementById(styleId)) return;

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = `
      .skeleton {
        background: linear-gradient(
          90deg,
          var(--color-surface, #18181f) 0%,
          var(--color-surface-highlight, #252530) 50%,
          var(--color-surface, #18181f) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);
}

// Wrapper component that ensures styles are loaded
export function SkeletonProvider({ children }: { children: React.ReactNode }) {
  useSkeletonStyles();
  return <>{children}</>;
}
