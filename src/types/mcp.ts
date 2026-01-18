// MCP (Model Context Protocol) adapter types

import { SearchParams, Listing, ListingDetail } from './listing';

export type MCPMode = 'playwright' | 'browserbase' | 'both';

export interface MCPAdapter {
  readonly name: 'browserbase' | 'playwright';

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Health check for failover
  healthCheck(): Promise<boolean>;

  // Core search functionality
  searchAirbnb(params: SearchParams): Promise<Listing[]>;

  // Detail page scraping (3 concurrency)
  getListingDetails(url: string): Promise<ListingDetail>;

  // Batch get details (internal concurrency control)
  getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]>;
}

export interface MCPConfig {
  browserbase: {
    apiKey: string;
    projectId: string;
    timeout: number; // default 30000ms
  };
  playwright: {
    port: number; // default 3001
    browser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    timeout: number; // default 30000ms
  };
}

// Browserbase MCP Tools
export interface BrowserbaseMCPTools {
  browserbase_stagehand_navigate: {
    url: string;
  };
  browserbase_stagehand_act: {
    action: string; // natural language action
  };
  browserbase_stagehand_extract: {
    instruction: string;
    schema: Record<string, unknown>;
  };
  browserbase_screenshot: {
    fullPage?: boolean;
  };
}

// Playwright MCP Tools
export interface PlaywrightMCPTools {
  browser_run_code: {
    code: string; // JavaScript code to run
  };
  browser_snapshot: Record<string, never>;
  browser_console_messages: Record<string, never>;
  browser_network_requests: Record<string, never>;
}

export interface MCPToolCall<T = unknown> {
  name: string;
  arguments: T;
}

export interface MCPToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
