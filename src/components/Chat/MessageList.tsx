'use client';

import React, { useEffect, useRef, memo } from 'react';
import { ChatMessage } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { ListingCard } from './ListingCard';
import { Listing } from '@/types/listing';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: ChatMessage[];
}

export const MessageList = memo(function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={styles.messageList}>
      {messages.map((message) => (
        <div key={message.id}>
          <MessageBubble message={message} />

          {message.metadata?.searchResults && (
            <div className={styles.resultsGrid}>
              {(message.metadata.searchResults as Listing[]).map((listing) => (
                <ListingCard key={listing.url} listing={listing} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
});
