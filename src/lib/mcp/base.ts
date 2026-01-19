// Base MCP adapter with common functionality

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail } from '@/types/listing';
import { logger } from '@/lib/utils/logger';

export abstract class BaseMCPAdapter implements MCPAdapter {
  abstract readonly name: 'browserbase' | 'playwright' | 'playwright-mcp';
  protected connected: boolean = false;
  protected timeout: number;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  abstract healthCheck(): Promise<boolean>;
  abstract searchAirbnb(params: SearchParams): Promise<Listing[]>;
  abstract getListingDetails(url: string): Promise<ListingDetail>;

  /**
   * Get multiple listing details with concurrency control (max 3)
   */
  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    const results: ListingDetail[] = [];
    const concurrency = 3;

    logger.info('mcp', 'Fetching listing details', {
      adapter: this.name,
      urlCount: urls.length,
      concurrency
    });

    // Process in batches of 3
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(url => this.getListingDetailsWithRetry(url))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('mcp', 'Failed to fetch listing details', {
            adapter: this.name,
            error: result.reason
          });
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i + concurrency < urls.length) {
        await this.randomDelay(1000, 2000);
      }
    }

    return results;
  }

  /**
   * Get listing details with retry logic
   */
  protected async getListingDetailsWithRetry(
    url: string,
    maxRetries: number = 2
  ): Promise<ListingDetail> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info('mcp', 'Retrying listing details fetch', {
            adapter: this.name,
            url,
            attempt: attempt + 1
          });
          await this.randomDelay(2000, 5000);
        }

        return await this.getListingDetails(url);
      } catch (error) {
        lastError = error as Error;
        logger.warn('mcp', 'Failed to fetch listing details', {
          adapter: this.name,
          url,
          attempt: attempt + 1,
          error: lastError.message
        });
      }
    }

    throw lastError || new Error('Failed to fetch listing details');
  }

  /**
   * Random delay to avoid rate limiting
   */
  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Format date for Airbnb URL (YYYY-MM-DD)
   */
  protected formatDate(date: string): string {
    return date; // Already in ISO format
  }

  /**
   * Build Airbnb search URL
   */
  protected buildSearchUrl(params: SearchParams): string {
    const baseUrl = 'https://www.airbnb.com/s';
    const searchParams = new URLSearchParams();

    // Location
    searchParams.append('query', params.location);

    // Dates
    searchParams.append('checkin', this.formatDate(params.checkIn));
    searchParams.append('checkout', this.formatDate(params.checkOut));

    // Guests
    searchParams.append('adults', params.guests?.toString() || '2');

    // Budget (price filter)
    if (params.budgetMin) {
      searchParams.append('price_min', params.budgetMin.toString());
    }
    if (params.budgetMax) {
      searchParams.append('price_max', params.budgetMax.toString());
    }

    return `${baseUrl}?${searchParams.toString()}`;
  }
}
