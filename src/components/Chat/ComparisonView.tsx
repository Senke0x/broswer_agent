'use client';

import React, { memo, useState } from 'react';
import { Listing } from '@/types/listing';
import { ChatMessage } from '@/types/chat';
import { ListingCard } from './ListingCard';
import styles from './ComparisonView.module.css';

interface ComparisonViewProps {
  comparison: NonNullable<ChatMessage['metadata']>['comparison'];
}

export const ComparisonView = memo(function ComparisonView({ comparison }: ComparisonViewProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'playwright' | 'browserbase'>('all');
  
  if (!comparison) return null;

  const { eval: evalResult, results } = comparison;
  const winnerLabel = evalResult.comparison.winner === 'tie'
    ? 'Tie'
    : evalResult.comparison.winner === 'playwright'
      ? 'Playwright'
      : 'Browserbase';

  return (
    <div className={styles.comparison}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>A/B Comparison</h3>
          <p className={styles.subtitle}>Winner: {winnerLabel}</p>
        </div>
        <span className={`${styles.badge} ${styles[`badge${winnerLabel}`]}`}>{winnerLabel}</span>
      </div>

      <div className={styles.metrics}>
        <MetricCard
          title="Playwright"
          completeness={evalResult.comparison.completenessScore.playwright}
          accuracy={evalResult.comparison.accuracyScore.playwright}
          speed={evalResult.comparison.speedScore.playwright}
          timeToFirst={evalResult.results.playwright?.timeToFirstResult}
          totalTime={evalResult.results.playwright?.totalTime}
          errors={evalResult.results.playwright?.errors}
        />
        <MetricCard
          title="Browserbase"
          completeness={evalResult.comparison.completenessScore.browserbase}
          accuracy={evalResult.comparison.accuracyScore.browserbase}
          speed={evalResult.comparison.speedScore.browserbase}
          timeToFirst={evalResult.results.browserbase?.timeToFirstResult}
          totalTime={evalResult.results.browserbase?.totalTime}
          errors={evalResult.results.browserbase?.errors}
        />
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Combined View
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'playwright' ? styles.active : ''}`}
          onClick={() => setActiveTab('playwright')}
        >
          Playwright Only
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'browserbase' ? styles.active : ''}`}
          onClick={() => setActiveTab('browserbase')}
        >
          Browserbase Only
        </button>
      </div>

      <div className={styles.results}>
        {(activeTab === 'all' || activeTab === 'playwright') && (
           <ResultsColumn title="Playwright Results" listings={results.playwright} />
        )}
        {(activeTab === 'all' || activeTab === 'browserbase') && (
           <ResultsColumn title="Browserbase Results" listings={results.browserbase} />
        )}
      </div>
    </div>
  );
});

function MetricCard({
  title,
  completeness,
  accuracy,
  speed,
  timeToFirst,
  totalTime,
  errors,
}: {
  title: string;
  completeness: number;
  accuracy: number;
  speed: number;
  timeToFirst?: number;
  totalTime?: number;
  errors?: string[];
}) {
  return (
    <div className={styles.metricCard}>
      <h4 className={styles.metricTitle}>{title}</h4>
      <MetricRow label="Completeness" value={`${completeness}%`} />
      <MetricRow label="Accuracy" value={`${accuracy}%`} />
      <MetricRow label="Speed" value={`${speed}%`} />
      <MetricRow label="Time to first" value={formatDuration(timeToFirst)} />
      <MetricRow label="Total time" value={formatDuration(totalTime)} />
      {errors && errors.length > 0 && (
        <div className={styles.errorList}>
          <span className={styles.errorLabel}>Errors</span>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricRow}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function ResultsColumn({ title, listings }: { title: string; listings?: Listing[] }) {
  return (
    <div className={styles.resultsColumn}>
      <h4 className={styles.resultsTitle}>{title}</h4>
      {listings && listings.length > 0 ? (
        <div className={styles.resultsGrid}>
          {listings.map((listing) => (
            <ListingCard key={getListingKey(listing)} listing={listing} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>No results.</p>
      )}
    </div>
  );
}

function getListingKey(listing: Listing): string {
  return listing.url || listing.title || `${listing.pricePerNight}-${listing.currency}`;
}

function formatDuration(duration?: number): string {
  if (!duration || Number.isNaN(duration)) return '—';
  if (duration < 1000) return `${duration} ms`;
  return `${(duration / 1000).toFixed(1)} s`;
}
