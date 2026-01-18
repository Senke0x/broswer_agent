// Reusable button component

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    opacity: disabled || loading ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: '#ffffff',
    },
    secondary: {
      backgroundColor: 'var(--color-secondary)',
      color: '#ffffff',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
  };

  const sizeStyles = {
    sm: {
      padding: '6px 12px',
      fontSize: 'var(--font-size-sm)',
    },
    md: {
      padding: '10px 20px',
      fontSize: 'var(--font-size-base)',
    },
    lg: {
      padding: '14px 28px',
      fontSize: 'var(--font-size-lg)',
    },
  };

  return (
    <button
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
      disabled={disabled || loading}
      className={className}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
