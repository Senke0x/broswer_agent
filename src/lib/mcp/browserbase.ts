// Browserbase MCP Adapter Implementation

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail, Review } from '@/types/listing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface BrowserbaseConfig {
  apiKey: string;
  projectId: string;
  timeout: number;
}

export class BrowserbaseAdapter implements MCPAdapter {
  readonly name = 'browserbase' as const;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: BrowserbaseConfig;
  private connected = false;

  constructor(config: BrowserbaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Create MCP client transport
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@browserbasehq/mcp-server-browserbase'],
        env: {
          ...process.env,
          BROWSERBASE_API_KEY: this.config.apiKey,
          BROWSERBASE_PROJECT_ID: this.config.projectId,
        },
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
      throw new Error(`Failed to connect to Browserbase: ${error}`);
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
      throw new Error(`Failed to disconnect from Browserbase: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      // Try to list available tools as a health check
      const tools = await this.client?.listTools();
      return tools !== undefined && tools.tools.length > 0;
    } catch {
      return false;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected || !this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      // Build Airbnb search URL
      const searchUrl = this.buildSearchUrl(params);

      // Navigate to search page
      await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url: searchUrl }
      });

      // Wait for listings to load
      await this.delay(2000);

      // Extract listings using structured extraction
      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract all Airbnb listing cards with title, price, rating, review count, and URL'
        }
      });

      // Parse and format results
      const listings = this.parseListings(extractResult.content, params.currency || 'USD');

      // Return top 10 listings
      return listings.slice(0, 10);
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

    if (params.budgetMin) {
      searchParams.append('price_min', params.budgetMin.toString());
    }
    if (params.budgetMax) {
      searchParams.append('price_max', params.budgetMax.toString());
    }

    return `${baseUrl}?${searchParams.toString()}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseListings(content: unknown, currency: string): Listing[] {
    // Parse the extracted content into Listing objects
    // This will depend on the structure returned by the extract tool
    const listings: Listing[] = [];

    try {
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
            currency: currency,
            rating: toNumberValue(record.rating),
            reviewCount: toIntegerValue(record.reviewCount),
            reviewSummary: null,
            url: typeof record.url === 'string' ? record.url : ''
          });
        }
      }
    } catch (error) {
      console.error('Failed to parse listings:', error);
    }

    return listings;
  }

  private parsePrice(priceStr: string): number {
    // Extract numeric value from price string (e.g., "$123" -> 123)
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected || !this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      // Navigate to listing detail page
      await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url }
      });

      // Wait for page to load
      await this.delay(2000);

      // Extract listing details and reviews
      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract listing title, price per night, rating, review count, and up to 15 review texts with author names and dates'
        }
      });

      // Parse the extracted data
      return this.parseListingDetail(extractResult.content, url);
    } catch (error) {
      throw new Error(`Failed to get listing details: ${error}`);
    }
  }

  private parseListingDetail(content: unknown, url: string): ListingDetail {
    const record = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};
    const reviews: Review[] = [];

    // Parse reviews from extracted content
    const rawReviews = Array.isArray(record.reviews) ? record.reviews : [];
    for (const review of rawReviews.slice(0, 15)) {
      if (!review || typeof review !== 'object') continue;
      const reviewRecord = review as Record<string, unknown>;
      reviews.push({
        author: typeof reviewRecord.author === 'string' ? reviewRecord.author : 'Anonymous',
        date: typeof reviewRecord.date === 'string' ? reviewRecord.date : new Date().toISOString(),
        text: typeof reviewRecord.text === 'string' ? reviewRecord.text : ''
      });
    }

    return {
      title: typeof record.title === 'string' ? record.title : '',
      pricePerNight: record.price ? this.parsePrice(toStringValue(record.price)) : 0,
      currency: 'USD',
      rating: toNumberValue(record.rating),
      reviewCount: toIntegerValue(record.reviewCount),
      reviewSummary: null,
      reviews,
      url
    };
  }

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    // Limit concurrency to 3 as per requirements
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

function toIntegerValue(value: unknown): number | null {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
