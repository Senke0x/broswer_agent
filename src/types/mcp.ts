// MCP (Model Context Protocol) adapter types

import { SearchParams, Listing, ListingDetail } from './listing';

export type MCPMode = 'playwright' | 'browserbase' | 'playwright-mcp' | 'both';

export interface MCPAdapter {
  readonly name: 'browserbase' | 'playwright' | 'playwright-mcp';

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

  // Screenshot (optional, Playwright only)
  takeScreenshot?(): Promise<string | null>;
  setScreenshotCallback?(callback: (base64: string) => void): void;
}

export interface MCPConfig {
  browserbase: {
    mode: 'cloud' | 'local'; // NEW: mode selection
    // Cloud mode config
    apiKey: string;
    projectId: string;
    timeout: number; // default 30000ms
    // Local mode config
    localOptions?: {
      headless: boolean;
      executablePath?: string; // Custom Chrome path
      userDataDir?: string; // Chrome profile directory
    };
  };
  playwright: {
    port: number; // default 3001
    browser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    timeout: number; // default 30000ms
  };
  playwrightMcp: {
    url: string;
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
  browser_navigate: {
    url: string;
  };
  browser_run_code: {
    code: string; // Playwright code snippet
  };
  browser_evaluate: {
    function: string;
    element?: string;
    ref?: string;
  };
  browser_wait_for: {
    time?: number;
    text?: string;
    textGone?: string;
  };
  browser_take_screenshot: {
    type?: 'png' | 'jpeg';
    fullPage?: boolean;
    element?: string;
    ref?: string;
  };
  browser_snapshot: Record<string, never>;
  browser_console_messages: {
    level?: string;
  };
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
