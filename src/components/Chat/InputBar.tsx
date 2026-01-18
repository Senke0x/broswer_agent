'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import styles from './InputBar.module.css';

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  onSend,
  disabled = false,
  placeholder = 'Type your message...'
}: InputBarProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.inputBar}>
      <input
        type="text"
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
      >
        Send
      </Button>
    </div>
  );
}
