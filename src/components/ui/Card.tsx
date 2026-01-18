import React from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  return (
    <div className={`${styles.card} ${styles[variant]} ${className}`}>
      {children}
    </div>
  );
}
