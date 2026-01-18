'use client';

import React, { memo, useState, useEffect } from 'react';
import { Listing } from '@/types/listing';
import { Card } from '../ui/Card';
import styles from './ListingCard.module.css';

interface ListingCardProps {
  listing: Listing;
}

// Default placeholder image when no image is available
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';

export const ListingCard = memo(function ListingCard({ listing }: ListingCardProps) {
  const {
    title,
    pricePerNight,
    currency,
    rating,
    reviewCount,
    reviewSummary,
    url,
    imageUrl
  } = listing;

  const [imgSrc, setImgSrc] = useState(imageUrl || PLACEHOLDER_IMAGE);
  const [imgError, setImgError] = useState(false);

  // Update image source when listing changes
  useEffect(() => {
    if (imageUrl) {
      setImgSrc(imageUrl);
      setImgError(false);
    } else {
      setImgSrc(PLACEHOLDER_IMAGE);
    }
  }, [imageUrl]);

  const handleImageError = () => {
    if (!imgError) {
      console.warn(`[ListingCard] Image load failed for: ${title}`, {
        originalUrl: imageUrl,
        url: url
      });
      setImgError(true);
      setImgSrc(PLACEHOLDER_IMAGE);
    }
  };

  return (
    <Card className={styles.listingCard}>
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {/* Image Section */}
        <div className={styles.imageWrapper}>
          <img
            src={imgSrc}
            alt={title}
            className={styles.image}
            onError={handleImageError}
            loading="lazy"
          />
          {rating && (
            <div className={styles.ratingBadge}>
              ⭐ {rating.toFixed(1)}
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>

          <div className={styles.priceRow}>
            <span className={styles.priceAmount}>{currency} {pricePerNight}</span>
            <span className={styles.priceLabel}> / night</span>
            {reviewCount !== null && reviewCount > 0 && (
              <span className={styles.reviewCount}>· {reviewCount} reviews</span>
            )}
          </div>

          {reviewSummary && (
            <div className={styles.summary}>
              <p className={styles.summaryText}>{reviewSummary}</p>
            </div>
          )}
        </div>
      </a>
    </Card>
  );
});
