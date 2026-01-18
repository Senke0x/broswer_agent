'use client';

import React, { memo } from 'react';
import { Listing } from '@/types/listing';
import { Card } from '../ui/Card';
import styles from './ListingCard.module.css';

interface ListingCardProps {
  listing: Listing;
}

export const ListingCard = memo(function ListingCard({ listing }: ListingCardProps) {
  const {
    title,
    pricePerNight,
    currency,
    rating,
    reviewCount,
    reviewSummary,
    url
  } = listing;

  return (
    <Card className={styles.listingCard}>
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          {rating && (
            <div className={styles.rating}>
              ⭐ {rating.toFixed(1)}
              {reviewCount && <span className={styles.reviewCount}>({reviewCount})</span>}
            </div>
          )}
        </div>

        <div className={styles.price}>
          <span className={styles.priceAmount}>{currency} {pricePerNight}</span>
          <span className={styles.priceLabel}> / night</span>
        </div>

        {reviewSummary && (
          <div className={styles.summary}>
            <p className={styles.summaryText}>{reviewSummary}</p>
          </div>
        )}
      </a>
    </Card>
  );
});
