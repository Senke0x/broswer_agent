// Browserbase MCP Adapter Implementation

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail } from '@/types/listing';
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

    // Implementation will be added in next segment
    throw new Error('Not implemented yet');
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected || !this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    // Implementation will be added in next segment
    throw new Error('Not implemented yet');
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
