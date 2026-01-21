// Browserbase MCP Adapter (Cloud)

import { MCPAdapter, MCPConfig } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail } from '@/types/listing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { extractToolText, parseListingDetail, parseListings } from './browserbase-utils';

type BrowserbaseConfig = MCPConfig['browserbase'];

export class BrowserbaseAdapter implements MCPAdapter {
  readonly name = 'browserbase' as const;

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: BrowserbaseConfig;
  private connected = false;
  private screenshotCallback?: (base64: string) => void;

  constructor(config: BrowserbaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@browserbasehq/mcp-server-browserbase'],
        env: {
          ...process.env,
          BROWSERBASE_API_KEY: this.config.apiKey,
          BROWSERBASE_PROJECT_ID: this.config.projectId,
        },
      });

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

  setScreenshotCallback(callback: (base64: string) => void): void {
    this.screenshotCallback = callback;
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.connected || !this.client) return null;

    const result = await this.client.callTool({
      name: 'browserbase_screenshot',
      arguments: { fullPage: true }
    });

    if (!Array.isArray(result.content)) return null;

    const imagePart = result.content.find(
      (item) => item && typeof item === 'object' && 'type' in item && item.type === 'image'
    ) as { data?: string } | undefined;

    if (imagePart?.data) {
      if (this.screenshotCallback) {
        this.screenshotCallback(imagePart.data);
        return null;
      }
      return imagePart.data;
    }

    const resourcePart = result.content.find(
      (item) => item && typeof item === 'object' && 'type' in item && item.type === 'resource'
    ) as { resource?: { blob?: string; mimeType?: string } } | undefined;

    if (resourcePart?.resource?.blob && resourcePart.resource.mimeType?.startsWith('image/')) {
      if (this.screenshotCallback) {
        this.screenshotCallback(resourcePart.resource.blob);
        return null;
      }
      return resourcePart.resource.blob;
    }

    return null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected || !this.client) return false;

    try {
      const tools = await this.client.listTools();
      return tools !== undefined && tools.tools.length > 0;
    } catch {
      return false;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected || !this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    return this.searchAirbnbCloud(params);
  }

  private async searchAirbnbCloud(params: SearchParams): Promise<Listing[]> {
    if (!this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      const searchUrl = this.buildSearchUrl(params);

      const navigateResult = await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url: searchUrl }
      });
      this.assertToolSuccess(navigateResult, 'Navigate to search page');

      await this.delay(2000);

      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract all Airbnb listing cards with title, price, rating, review count, and URL'
        }
      });
      this.assertToolSuccess(extractResult, 'Extract listings');

      const listings = parseListings(extractResult.content, params.currency || 'USD');
      return listings.slice(0, 10);
    } catch (error) {
      throw new Error(`Failed to search Airbnb: ${error}`);
    }
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected || !this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    return this.getListingDetailsCloud(url);
  }

  private async getListingDetailsCloud(url: string): Promise<ListingDetail> {
    if (!this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      const navigateResult = await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url }
      });
      this.assertToolSuccess(navigateResult, 'Navigate to listing detail page');

      await this.delay(2000);

      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract listing title, price per night, rating, review count, and up to 15 review texts with author names and dates'
        }
      });
      this.assertToolSuccess(extractResult, 'Extract listing details');

      return parseListingDetail(extractResult.content, url);
    } catch (error) {
      throw new Error(`Failed to get listing details: ${error}`);
    }
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

  private assertToolSuccess(result: { isError?: boolean; content?: unknown }, action: string): void {
    if (!result?.isError) return;
    const detail = extractToolText(result.content);
    throw new Error(detail ? `${action} failed: ${detail}` : `${action} failed`);
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
}
