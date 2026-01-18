'use client';

import React, { useEffect, useRef, memo } from 'react';
import { ChatMessage } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { ListingCard } from './ListingCard';
import { ComparisonView } from './ComparisonView';
import { ActionStatus } from './ActionStatus';
import { SkeletonCard, SkeletonText } from '../ui/Skeleton';
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
            <SkeletonText lines={2} />
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
