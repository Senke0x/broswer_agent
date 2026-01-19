import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SSEChunk, SSEEncoder } from '@/lib/chat/sse-encoder';
import { planNextAction } from '@/lib/llm/planner';
import { summarizeReviews } from '@/lib/llm/summarizer';
import { buildEvalResult } from '@/lib/evaluator';
import { postProcessListings } from '@/lib/search/postprocess';
import { createMCPAdapter, getDefaultMCPConfig, validateMCPConfig } from '@/lib/mcp/adapter';
import { APP_CONFIG } from '@/config/constants';
import { logger } from '@/lib/utils/logger';
import { ChatMessage } from '@/types/chat';
import { Listing, ListingDetail, SearchParams } from '@/types/listing';
import { MCPAdapter, MCPMode } from '@/types/mcp';
import { MCPExecutionResult } from '@/types/eval';
import { ApplicationError, ErrorCode } from '@/lib/errors/types';
import { getErrorMessage } from '@/lib/errors/handler';

export const runtime = 'nodejs';

const RATE_WINDOW_MS = 60_000;
const rateLimitBucket = new Map<string, number[]>();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const message = searchParams.get('message');
  const historyStr = searchParams.get('history');
  const requestedMode = searchParams.get('mode');
  const model = searchParams.get('model') || undefined;
  const userTime = searchParams.get('userTime') || undefined;
  const userTimezone = searchParams.get('userTimezone') || undefined;

  if (!message) {
    return new Response('Message is required', { status: 400 });
  }

  const encoder = new SSEEncoder();
  const streamHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  const clientId = getClientId(request);
  const rateLimitResult = checkRateLimit(clientId);
  if (!rateLimitResult.allowed) {
    const errorMessage = 'Rate limit exceeded. Please wait a minute and try again.';
    logger.warn('api', 'rate_limit_blocked', {
      clientId,
      retryAfter: rateLimitResult.retryAfter,
    });
    const stream = encoder.createStream(async function* () {
      yield {
        type: 'event',
        event: 'server-error',
        data: JSON.stringify({
          error: errorMessage,
          retryAfter: rateLimitResult.retryAfter,
        }),
      };
    }());
    return new Response(stream, {
      headers: {
        ...streamHeaders,
        'Retry-After': String(rateLimitResult.retryAfter ?? 60),
      },
    });
  }

  const userMessage: string = message;
  let history: ChatMessage[] = [];
  try {
    history = historyStr ? JSON.parse(historyStr) : [];
  } catch (error) {
    logger.error('api', 'Failed to parse history', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const traceId = randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: SSEChunk) => {
        if (typeof chunk === 'string') {
          controller.enqueue(encoder.encodeMessage(chunk));
        } else if (chunk.type === 'message') {
          controller.enqueue(encoder.encodeMessage(chunk.data));
        } else {
          controller.enqueue(encoder.encodeEvent(chunk.event, chunk.data));
        }
      };

      const sendStatus = (status: string) => {
        send({ type: 'event', event: 'status', data: status });
      };

      logger.setTraceId(traceId);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 60000) // Increased timeout for deep scraping
        );

        // Initial status
        sendStatus('Understanding your request...');

        const planResult = await Promise.race([
          planNextAction(userMessage, history, { model, userTime, userTimezone }),
          timeoutPromise,
        ]);

        if (planResult.toolCall) {
          send({
            type: 'event',
            event: 'results',
            data: JSON.stringify({ toolCalls: [planResult.toolCall] }),
          });
        }

        if (planResult.action === 'ask_clarification') {
          logger.info('api', 'clarification_requested', {
            missingFields: planResult.missingFields,
          });
          sendStatus('Clarification needed');
          const message = planResult.message || 'Could you provide more details?';
          send(message);
          // Send completion signal before closing
          controller.enqueue(encoder.encodeComplete());
          controller.close();
          return;
        }

        if (planResult.action === 'execute_search') {
          const normalizedParams = normalizeSearchParams(planResult.searchParams);
          if (!normalizedParams) {
            send('I still need the location, check-in date, and check-out date to continue.');
            // Send completion signal before closing
            controller.enqueue(encoder.encodeComplete());
            controller.close();
            return;
          }

          const mode = resolveMCPMode(requestedMode || planResult.mcpMode);
          logger.info('api', 'search_requested', {
            mode,
            location: normalizedParams.location,
            checkIn: normalizedParams.checkIn,
            checkOut: normalizedParams.checkOut,
            hasBudget: Boolean(normalizedParams.budgetMin || normalizedParams.budgetMax),
          });

          sendStatus(`Planning search in ${normalizedParams.location}...`);
          send(`Searching Airbnb listings using ${mode}...\n`);

          // Screenshot callback to send screenshots via SSE
          const onScreenshot = (screenshot: string) => {
            send({
              type: 'event',
              event: 'browser-screenshot',
              data: screenshot, // Base64 encoded image
            });
          };

          const searchStart = Date.now();
          const searchOutput = await runSearchPipeline(normalizedParams, mode, sendStatus, model, onScreenshot);
          const searchDuration = Date.now() - searchStart;

          if (searchOutput.comparison) {
            send(`Comparison complete. Winner: ${searchOutput.comparison.eval.comparison.winner}.\n`);
          } else {
            send(`Found ${searchOutput.listings.length} listings.\n`);
          }

          if (searchOutput.notes.length > 0) {
            send(`${searchOutput.notes.join(' ')}\n`);
          }

          logger.withDuration('info', 'api', 'search_complete', searchDuration, {
            mode: searchOutput.mode,
            resultCount: searchOutput.listings.length,
            comparison: Boolean(searchOutput.comparison),
          });

          const metadata: ChatMessage['metadata'] = {
            mcpMode: searchOutput.mode,
          };

          if (searchOutput.comparison) {
            metadata.comparison = searchOutput.comparison;
          } else {
            metadata.searchResults = searchOutput.listings;
          }

          send({
            type: 'event',
            event: 'results',
            data: JSON.stringify(metadata),
          });

          // Clear status at the end
          sendStatus('');
          // Send completion signal before closing
          controller.enqueue(encoder.encodeComplete());
          controller.close();
          return;
        }

        if (planResult.action === 'error') {
          send(planResult.message || 'Sorry, I encountered an error processing your request.');
          sendStatus('');
          // Send completion signal before closing
          controller.enqueue(encoder.encodeComplete());
          controller.close();
          return;
        }
      } catch (error) {
        logger.error('api', 'Error in generateResponse', {
          error: error instanceof Error ? error.message : String(error),
        });
        const errorMessage = getErrorMessage(error);
        send(errorMessage);
        sendStatus('');
        // Send completion signal before closing, even on error
        try {
          controller.enqueue(encoder.encodeComplete());
        } catch (e) {
          // Ignore if stream is already closed
        }
        controller.close();
      } finally {
        logger.clearTraceId();
      }
    }
  });

  return new Response(stream, { headers: streamHeaders });
}

interface SearchOutput {
  mode: MCPMode;
  listings: Listing[];
  notes: string[];
  comparison?: NonNullable<ChatMessage['metadata']>['comparison'];
}

function normalizeSearchParams(params?: Partial<SearchParams>): SearchParams | null {
  if (!params?.location || !params.checkIn || !params.checkOut) {
    return null;
  }

  return {
    location: params.location,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: params.guests ?? APP_CONFIG.search.defaultGuests,
    budgetMin: params.budgetMin ?? null,
    budgetMax: params.budgetMax ?? null,
    currency: params.currency ?? 'USD',
  };
}

function resolveMCPMode(modeParam?: string | null): MCPMode {
  if (modeParam === 'browserbase' || modeParam === 'playwright' || modeParam === 'playwright-mcp' || modeParam === 'both') {
    return modeParam;
  }
  return APP_CONFIG.mcp.defaultMode;
}

async function runSearchPipeline(
  params: SearchParams,
  mode: MCPMode,
  onStatus?: (status: string) => void,
  model?: string,
  onScreenshot?: (screenshot: string) => void
): Promise<SearchOutput> {
  const config = getDefaultMCPConfig();
  let resolvedMode = mode;
  const notes: string[] = [];

  logger.info('mcp', 'pipeline_start', {
    mode,
    location: params.location,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  });

  if (mode === 'browserbase' || mode === 'both') {
    try {
      validateMCPConfig(mode, config);
    } catch {
      if (mode === 'both') {
        resolvedMode = 'playwright';
        notes.push('Browserbase credentials missing; using Playwright only.');
      } else {
        throw new ApplicationError(
          ErrorCode.MCP_CONNECTION_FAILED,
          'Browserbase configuration missing',
          'Browserbase is not configured. Please configure it or switch to Playwright.',
          false
        );
      }
    }
  }

  if (mode === 'playwright-mcp') {
    validateMCPConfig(mode, config);
  }

  if (resolvedMode === 'both') {
    onStatus?.('Initializing parallel search (Playwright + Browserbase)...');
    const adapters = createMCPAdapter('both', config) as MCPAdapter[];
    const results = await Promise.all(adapters.map(adapter => runAdapterSearch(adapter, params, onStatus, model, onScreenshot)));
    const resultsByName = toResultsByAdapter(adapters, results);

    onStatus?.('Processing and comparing results...');
    const [playwrightProcessed, browserbaseProcessed] = await Promise.all([
      resultsByName.playwright
        ? Promise.resolve(postProcessListings(resultsByName.playwright.listings, params))
        : Promise.resolve(null),
      resultsByName.browserbase
        ? Promise.resolve(postProcessListings(resultsByName.browserbase.listings, params))
        : Promise.resolve(null),
    ]);

    const evalResult = buildEvalResult(params, {
      playwright: resultsByName.playwright,
      browserbase: resultsByName.browserbase,
    });
    logger.info('api', 'eval_result', {
      sessionId: evalResult.sessionId,
      winner: evalResult.comparison.winner,
      completenessScore: evalResult.comparison.completenessScore,
      accuracyScore: evalResult.comparison.accuracyScore,
      speedScore: evalResult.comparison.speedScore,
      resultCounts: {
        playwright: resultsByName.playwright?.listings.length ?? 0,
        browserbase: resultsByName.browserbase?.listings.length ?? 0,
      },
      errorCounts: {
        playwright: resultsByName.playwright?.errors.length ?? 0,
        browserbase: resultsByName.browserbase?.errors.length ?? 0,
      },
    });

    const comparison: NonNullable<SearchOutput['comparison']> = {
      eval: evalResult,
      results: {
        playwright: playwrightProcessed?.listings ?? resultsByName.playwright?.listings,
        browserbase: browserbaseProcessed?.listings ?? resultsByName.browserbase?.listings,
      },
    };

    const mergedNotes = [
      ...notes,
      ...(playwrightProcessed?.notes ?? []).map(note => `Playwright: ${note}`),
      ...(browserbaseProcessed?.notes ?? []).map(note => `Browserbase: ${note}`),
    ];

    return {
      mode: 'both',
      listings: [],
      notes: mergedNotes,
      comparison,
    };
  }

  const primaryAdapter = createMCPAdapter(resolvedMode, config) as MCPAdapter;
  const primaryResult = await runAdapterSearch(primaryAdapter, params, onStatus, model, onScreenshot);

  // For playwright-mcp mode, fail immediately if search failed
  if (resolvedMode === 'playwright-mcp' && primaryResult.listings.length === 0 && primaryResult.errors.length > 0) {
    const errorMessage = primaryResult.errors.join('; ') || 'Playwright MCP search failed';
    logger.error('mcp', 'playwright_mcp_search_failed_no_fallback', {
      errors: primaryResult.errors,
      totalTime: primaryResult.totalTime,
    });
    throw new ApplicationError(
      ErrorCode.MCP_CONNECTION_FAILED,
      'Playwright MCP search failed',
      errorMessage,
      false
    );
  }

  onStatus?.('Filtering and ranking listings...');
  const processed = postProcessListings(primaryResult.listings, params);
  return {
    mode: resolvedMode,
    listings: processed.listings,
    notes: [...notes, ...processed.notes],
  };
}

function toResultsByAdapter(
  adapters: MCPAdapter[],
  results: MCPExecutionResult[]
): { playwright?: MCPExecutionResult; browserbase?: MCPExecutionResult } {
  const entries = adapters.map((adapter, index) => [adapter.name, results[index]] as const);
  const byName: { playwright?: MCPExecutionResult; browserbase?: MCPExecutionResult } = {};
  for (const [name, result] of entries) {
    // Only handle playwright and browserbase for 'both' mode
    if (name === 'playwright' || name === 'browserbase') {
      byName[name] = result;
    }
  }
  return byName;
}

async function runAdapterSearch(
  adapter: MCPAdapter,
  params: SearchParams,
  onStatus?: (status: string) => void,
  model?: string,
  onScreenshot?: (screenshot: string) => void
): Promise<MCPExecutionResult> {
  const start = Date.now();
  const errors: string[] = [];
  let timeToFirstResult = 0;
  let listings: Listing[] = [];

  try {
    onStatus?.(`Connecting to ${adapter.name}...`);
    await adapter.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    logger.error('mcp', 'Failed to connect adapter', {
      adapter: adapter.name,
      error: message,
    });
    return {
      listings: [],
      timeToFirstResult: 0,
      totalTime: Date.now() - start,
      errors,
    };
  }

  try {
    onStatus?.(`Searching Airbnb on ${adapter.name}...`);

    // Register screenshot callback if supported
    if (adapter.setScreenshotCallback && onScreenshot) {
      adapter.setScreenshotCallback(onScreenshot);
    }

    // If adapter supports screenshots and we have a callback, take screenshots
    if (adapter.takeScreenshot && onScreenshot) {
      // Create a wrapper to capture screenshots during search
      const searchWithScreenshots = async () => {
        const searchPromise = adapter.searchAirbnb(params);

        // Take initial screenshot after navigation
        setTimeout(async () => {
          try {
            const screenshot = await adapter.takeScreenshot?.();
            if (screenshot) {
              onScreenshot(screenshot);
            }
          } catch (err) {
            // Ignore screenshot errors
          }
        }, 3000);

        // Take screenshot after page load
        setTimeout(async () => {
          try {
            const screenshot = await adapter.takeScreenshot?.();
            if (screenshot) {
              onScreenshot(screenshot);
            }
          } catch (err) {
            // Ignore screenshot errors
          }
        }, 5000);

        return await searchPromise;
      };

      listings = await withRetry(
        searchWithScreenshots,
        2,
        APP_CONFIG.retry.intervalMs
      );

      // Final screenshot after search completes
      try {
        const screenshot = await adapter.takeScreenshot?.();
        if (screenshot && onScreenshot) {
          onScreenshot(screenshot);
        }
      } catch (err) {
        // Ignore screenshot errors
      }
    } else {
      listings = await withRetry(
        () => adapter.searchAirbnb(params),
        2,
        APP_CONFIG.retry.intervalMs
      );
    }

    timeToFirstResult = Date.now() - start;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    logger.error('mcp', 'Search failed', {
      adapter: adapter.name,
      error: message,
    });
  }

  if (listings.length > 0) {
    try {
      onStatus?.(`Enriching ${listings.length} listings via ${adapter.name}...`);
      listings = await enrichListings(adapter, listings, onStatus, model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.warn('mcp', 'Failed to enrich listings', {
        adapter: adapter.name,
        error: message,
      });
    }
  }

  try {
    await adapter.disconnect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    logger.warn('mcp', 'Failed to disconnect adapter', {
      adapter: adapter.name,
      error: message,
    });
  }

  const totalTime = Date.now() - start;
  const effectiveFirst = timeToFirstResult || totalTime;

  logger.withDuration('info', 'mcp', 'adapter_complete', totalTime, {
    adapter: adapter.name,
    resultCount: listings.length,
    timeToFirstResult: effectiveFirst,
    errors: errors.length,
  });

  return {
    listings,
    timeToFirstResult: effectiveFirst,
    totalTime,
    errors,
  };
}

async function enrichListings(
  adapter: MCPAdapter,
  listings: Listing[],
  onStatus?: (status: string) => void,
  model?: string
): Promise<Listing[]> {
  const urls = listings.map(listing => listing.url).filter(Boolean);
  if (urls.length === 0) return listings;

  onStatus?.(`Scraping details for ${urls.length} listings...`);
  const details = await adapter.getMultipleListingDetails(urls);
  const detailsByUrl = new Map(details.map(detail => [detail.url, detail]));

  onStatus?.('Summarizing reviews with AI...');
  const summaries = await summarizeDetails(details, model);

  return listings.map((listing) => mergeListingDetails(listing, detailsByUrl, summaries));
}

async function summarizeDetails(
  details: ListingDetail[],
  model?: string
): Promise<Map<string, string>> {
  const summaryMap = new Map<string, string>();
  const concurrency = APP_CONFIG.scraping.detailPageConcurrency;
  const entries = await mapWithConcurrency(details, concurrency, async (detail) => {
    if (!detail?.reviews || detail.reviews.length === 0) return null;

    try {
      const summary = await summarizeReviews(detail.reviews, detail.title || 'Listing', model);
      return [detail.url, summary] as const;
    } catch (error) {
      logger.warn('llm', 'Review summarization failed', {
        error: error instanceof Error ? error.message : String(error),
        listingUrl: detail.url,
      });
      return null;
    }
  });

  for (const entry of entries) {
    if (!entry) continue;
    summaryMap.set(entry[0], entry[1]);
  }
  return summaryMap;
}

function mergeListingDetails(
  listing: Listing,
  detailsByUrl: Map<string, ListingDetail>,
  summaries: Map<string, string>
): Listing {
  const detail = detailsByUrl.get(listing.url);
  if (!detail) return listing;

  // Prefer detail page image over search result image (detail page has higher quality)
  const imageUrl = detail.imageUrl || listing.imageUrl;

  return {
    ...listing,
    title: detail.title || listing.title,
    pricePerNight: detail.pricePerNight || listing.pricePerNight,
    currency: detail.currency || listing.currency,
    rating: detail.rating ?? listing.rating,
    reviewCount: detail.reviewCount ?? listing.reviewCount,
    reviewSummary: summaries.get(detail.url) ?? listing.reviewSummary,
    url: listing.url || detail.url,
    imageUrl, // Use detail page image (higher quality) if available
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < attempts - 1) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError ?? new Error('Operation failed after retry');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

function checkRateLimit(clientId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const timestamps = rateLimitBucket.get(clientId) || [];
  const recent = timestamps.filter(timestamp => timestamp >= windowStart);

  if (recent.length >= APP_CONFIG.rateLimit.requestsPerMinute) {
    const retryAfterMs = RATE_WINDOW_MS - (now - recent[0]);
    return {
      allowed: false,
      retryAfter: Math.ceil(retryAfterMs / 1000),
    };
  }

  recent.push(now);
  rateLimitBucket.set(clientId, recent);
  return { allowed: true };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R | null>
): Promise<Array<R | null>> {
  if (items.length === 0) return [];
  const results: Array<R | null> = [];
  let index = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}
