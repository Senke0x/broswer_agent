'use client';

import React, { useEffect, useRef, memo } from 'react';
import { ChatMessage } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { ListingCard } from './ListingCard';
import { ComparisonView } from './ComparisonView';
import { ActionStatus } from './ActionStatus';
import { SkeletonCard } from '../ui/Skeleton';
import { Listing } from '@/types/listing';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  currentStatus?: string | null;
}

export const MessageList = memo(function MessageList({ messages, isLoading = false, currentStatus }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStatus, isLoading]);

  return (
    <div className={styles.messageList}>
      {messages.map((message) => (
        <div key={message.id}>
          <MessageBubble message={message} />

          {message.metadata?.comparison ? (
            <ComparisonView comparison={message.metadata.comparison} />
          ) : message.metadata?.searchResults ? (
            <div className={styles.resultsGrid}>
              {(message.metadata.searchResults as Listing[]).map((listing) => (
                <ListingCard key={listing.url || listing.title} listing={listing} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {isLoading && (
        <div className={styles.loadingBlock}>
          {currentStatus && <ActionStatus status={currentStatus} />}
          <div className={styles.loadingBubble}>
            <div className={styles.loadingIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" fill="none"/>
              </svg>
            </div>
            <div className={styles.loadingContent}>
              <div className={styles.typingIndicator}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
            </div>
          </div>
          <div className={styles.loadingGrid}>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});
