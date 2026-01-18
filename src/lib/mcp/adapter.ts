// MCP Adapter Factory and Base Implementation

import { MCPAdapter, MCPMode, MCPConfig } from '@/types/mcp';
import { BrowserbaseAdapter } from './browserbase';
import { PlaywrightAdapter } from './playwright';

/**
 * Create an MCP adapter based on the specified mode
 */
export function createMCPAdapter(
  mode: MCPMode,
  config: MCPConfig
): MCPAdapter | MCPAdapter[] {
  switch (mode) {
    case 'browserbase':
      return new BrowserbaseAdapter(config.browserbase);
    case 'playwright':
      return new PlaywrightAdapter(config.playwright);
    case 'both':
      return [
        new BrowserbaseAdapter(config.browserbase),
        new PlaywrightAdapter(config.playwright),
      ];
    default:
      throw new Error(`Unknown MCP mode: ${mode}`);
  }
}

/**
 * Get the default MCP configuration from environment variables
 */
export function getDefaultMCPConfig(): MCPConfig {
  return {
    browserbase: {
      apiKey: process.env.BROWSERBASE_API_KEY || '',
      projectId: process.env.BROWSERBASE_PROJECT_ID || '',
      timeout: 30000,
    },
    playwright: {
      port: 3001,
      browser: (process.env.MCP_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit',
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false', // Default true, set to false to show browser
      timeout: 30000,
    },
  };
}

/**
 * Validate MCP configuration
 */
export function validateMCPConfig(mode: MCPMode, config: MCPConfig): void {
  if (mode === 'browserbase' || mode === 'both') {
    if (!config.browserbase.apiKey) {
      throw new Error('BROWSERBASE_API_KEY is required for browserbase mode');
    }
    if (!config.browserbase.projectId) {
      throw new Error('BROWSERBASE_PROJECT_ID is required for browserbase mode');
    }
  }
}
