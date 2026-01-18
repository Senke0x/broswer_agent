// Playwright MCP Adapter Implementation

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail, Review } from '@/types/listing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface PlaywrightConfig {
  port: number;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  timeout: number;
}

export class PlaywrightAdapter implements MCPAdapter {
  readonly name = 'playwright' as const;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: PlaywrightConfig;
  private connected = false;

  constructor(config: PlaywrightConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Create MCP client transport for Playwright
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright'],
        env: process.env as Record<string, string>,
      });

      // Create MCP client
      this.client = new Client(
        {
          name: 'airbnb-search-agent',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(this.transport);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Playwright: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client?.close();
      this.transport = null;
      this.client = null;
      this.connected = false;
    } catch (error) {
      throw new Error(`Failed to disconnect from Playwright: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const tools = await this.client?.listTools();
      return tools !== undefined && tools.tools.length > 0;
    } catch {
      return false;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected || !this.client) {
      throw new Error('Playwright adapter not connected');
    }

    try {
      const searchUrl = this.buildSearchUrl(params);

      // Use Playwright MCP to navigate and extract
      await this.client.callTool({
        name: 'playwright_navigate',
        arguments: { url: searchUrl }
      });

      await this.delay(2000);

      const extractResult = await this.client.callTool({
        name: 'playwright_evaluate',
        arguments: {
          expression: `Array.from(document.querySelectorAll('[data-testid="card-container"]')).slice(0, 10).map(card => ({
            title: card.querySelector('[data-testid="listing-card-title"]')?.textContent,
            price: card.querySelector('[data-testid="price-availability-row"]')?.textContent,
            rating: card.querySelector('[aria-label*="rating"]')?.textContent,
            url: card.querySelector('a[href*="/rooms/"]')?.href
          }))`
        }
      });

      return this.parseListings(extractResult.content, params.currency || 'USD');
    } catch (error) {
      throw new Error(`Failed to search Airbnb: ${error}`);
    }
  }

  private buildSearchUrl(params: SearchParams): string {
    const baseUrl = 'https://www.airbnb.com/s';
    const searchParams = new URLSearchParams();
    searchParams.append('query', params.location);
    searchParams.append('checkin', params.checkIn);
    searchParams.append('checkout', params.checkOut);
    searchParams.append('adults', params.guests?.toString() || '2');
    if (params.budgetMin) searchParams.append('price_min', params.budgetMin.toString());
    if (params.budgetMax) searchParams.append('price_max', params.budgetMax.toString());
    return `${baseUrl}?${searchParams.toString()}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseListings(content: unknown, currency: string): Listing[] {
    const listings: Listing[] = [];
    const data = Array.isArray(content) ? content : [content];

    for (const item of data) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : '';
      const priceRaw = toStringValue(record.price);
      if (title && priceRaw) {
        listings.push({
          title,
          pricePerNight: this.parsePrice(priceRaw),
          currency,
          rating: toNumberValue(record.rating),
          reviewCount: null,
          reviewSummary: null,
          url: typeof record.url === 'string' ? record.url : ''
        });
      }
    }
    return listings;
  }

  private parsePrice(priceStr: string): number {
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected || !this.client) {
      throw new Error('Playwright adapter not connected');
    }

    try {
      await this.client.callTool({
        name: 'playwright_navigate',
        arguments: { url }
      });

      await this.delay(2000);

      const extractResult = await this.client.callTool({
        name: 'playwright_evaluate',
        arguments: {
          expression: `({
            title: document.querySelector('h1')?.textContent,
            price: document.querySelector('[data-section-id="BOOK_IT_SIDEBAR"]')?.textContent,
            rating: document.querySelector('[aria-label*="rating"]')?.textContent,
            reviews: Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 15).map(r => ({
              text: r.querySelector('[data-testid="review-text"]')?.textContent,
              author: r.querySelector('[data-testid="review-author"]')?.textContent,
              date: r.querySelector('[data-testid="review-date"]')?.textContent
            }))
          })`
        }
      });

      return this.parseListingDetail(extractResult.content, url);
    } catch (error) {
      throw new Error(`Failed to get listing details: ${error}`);
    }
  }

  private parseListingDetail(content: unknown, url: string): ListingDetail {
    const reviews: Review[] = [];
    const record = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};

    const rawReviews = Array.isArray(record.reviews) ? record.reviews : [];
    for (const review of rawReviews) {
      if (!review || typeof review !== 'object') continue;
      const reviewRecord = review as Record<string, unknown>;
      const text = typeof reviewRecord.text === 'string' ? reviewRecord.text : '';
      if (!text) continue;
      reviews.push({
        text,
        author: typeof reviewRecord.author === 'string' ? reviewRecord.author : 'Anonymous',
        date: typeof reviewRecord.date === 'string' ? reviewRecord.date : new Date().toISOString()
      });
    }

    return {
      title: typeof record.title === 'string' ? record.title : '',
      pricePerNight: record.price ? this.parsePrice(toStringValue(record.price)) : 0,
      currency: 'USD',
      rating: toNumberValue(record.rating),
      reviewCount: reviews.length,
      reviewSummary: null,
      reviews,
      url
    };
  }

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    const results: ListingDetail[] = [];
    const batchSize = 3;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.getListingDetails(url))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '';
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
