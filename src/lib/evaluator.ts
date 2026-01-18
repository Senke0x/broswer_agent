import { APP_CONFIG } from '@/config/constants';
import { EvalMetrics, EvalResult, MCPExecutionResult } from '@/types/eval';
import { Listing, SearchParams } from '@/types/listing';

export interface EvaluationInputs {
  playwright?: MCPExecutionResult;
  browserbase?: MCPExecutionResult;
}

export function buildEvalResult(
  searchParams: SearchParams,
  results: EvaluationInputs
): EvalResult {
  const playwrightMetrics = results.playwright
    ? calculateMetrics(
        results.playwright.listings,
        results.playwright.timeToFirstResult,
        results.playwright.totalTime
      )
    : emptyMetrics();

  const browserbaseMetrics = results.browserbase
    ? calculateMetrics(
        results.browserbase.listings,
        results.browserbase.timeToFirstResult,
        results.browserbase.totalTime
      )
    : emptyMetrics();

  const winner = pickWinner(results, playwrightMetrics, browserbaseMetrics);

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    searchParams,
    results,
    comparison: {
      winner,
      completenessScore: {
        playwright: playwrightMetrics.completeness,
        browserbase: browserbaseMetrics.completeness,
      },
      accuracyScore: {
        playwright: playwrightMetrics.accuracy,
        browserbase: browserbaseMetrics.accuracy,
      },
      speedScore: {
        playwright: playwrightMetrics.speed,
        browserbase: browserbaseMetrics.speed,
      },
    },
  };
}

export function calculateMetrics(
  listings: Listing[],
  timeToFirstResult: number,
  totalTime: number
): EvalMetrics {
  const completeness = Math.min(
    100,
    Math.round((listings.length / APP_CONFIG.search.maxResults) * 100)
  );

  const accuracy = listings.length === 0
    ? 0
    : Math.round(
        listings.reduce((sum, listing) => sum + listingAccuracy(listing), 0) /
          listings.length
      );

  const targetMs = APP_CONFIG.mcp.timeout;
  const totalScore = Math.max(0, 1 - totalTime / targetMs);
  const firstScore = Math.max(0, 1 - timeToFirstResult / targetMs);
  const speed = Math.max(
    0,
    Math.min(100, Math.round((totalScore * 0.7 + firstScore * 0.3) * 100))
  );

  return {
    completeness,
    accuracy,
    speed,
  };
}

function listingAccuracy(listing: Listing): number {
  const fields = [
    listing.title?.trim().length ? 1 : 0,
    listing.url?.trim().length ? 1 : 0,
    listing.currency?.trim().length ? 1 : 0,
    listing.pricePerNight > 0 ? 1 : 0,
  ];

  return Math.round((fields.reduce((sum, value) => sum + value, 0) / fields.length) * 100);
}

function pickWinner(
  results: EvaluationInputs,
  playwrightMetrics: EvalMetrics,
  browserbaseMetrics: EvalMetrics
): 'playwright' | 'browserbase' | 'tie' {
  const hasPlaywright = Boolean(results.playwright);
  const hasBrowserbase = Boolean(results.browserbase);

  if (hasPlaywright && !hasBrowserbase) return 'playwright';
  if (!hasPlaywright && hasBrowserbase) return 'browserbase';
  if (!hasPlaywright && !hasBrowserbase) return 'tie';

  const playwrightScore = scoreMetrics(playwrightMetrics);
  const browserbaseScore = scoreMetrics(browserbaseMetrics);

  if (Math.abs(playwrightScore - browserbaseScore) < 1) return 'tie';
  return playwrightScore >= browserbaseScore ? 'playwright' : 'browserbase';
}

function scoreMetrics(metrics: EvalMetrics): number {
  return metrics.completeness * 0.4 + metrics.accuracy * 0.4 + metrics.speed * 0.2;
}

function emptyMetrics(): EvalMetrics {
  return { completeness: 0, accuracy: 0, speed: 0 };
}
