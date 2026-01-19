// MCP Adapter Factory and Base Implementation

import { MCPAdapter, MCPMode, MCPConfig } from '@/types/mcp';
import { BrowserbaseAdapter } from './browserbase';
import { PlaywrightAdapter } from './playwright';
import { PlaywrightMcpAdapter } from './playwright-mcp';

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
    case 'playwright-mcp':
      return new PlaywrightMcpAdapter(config.playwrightMcp);
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
  const browserbaseMode = process.env.BROWSERBASE_MODE?.toLowerCase() === 'local' ? 'local' : 'cloud';
  const stagehandHeadless = process.env.STAGEHAND_HEADLESS !== 'false';
  const chromeExecutablePath = process.env.CHROME_EXECUTABLE_PATH || undefined;
  const playwrightMcpHost = process.env.PLAYWRIGHT_MCP_HOST || '127.0.0.1';
  const playwrightMcpPort = parseInt(process.env.PLAYWRIGHT_MCP_PORT || process.env.MCP_PORT || '3001', 10);
  const playwrightMcpUrl = process.env.PLAYWRIGHT_MCP_URL || `http://${playwrightMcpHost}:${playwrightMcpPort}`;

  return {
    browserbase: {
      mode: browserbaseMode,
      apiKey: process.env.BROWSERBASE_API_KEY || '',
      projectId: process.env.BROWSERBASE_PROJECT_ID || '',
      timeout: 30000,
      localOptions: browserbaseMode === 'local'
        ? {
            headless: stagehandHeadless,
            executablePath: chromeExecutablePath,
          }
        : undefined,
    },
    playwright: {
      port: parseInt(process.env.MCP_PORT || '3001', 10),
      browser: (process.env.MCP_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit',
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false', // Default true, set to false to show browser
      timeout: 30000,
    },
    playwrightMcp: {
      url: playwrightMcpUrl,
      timeout: 30000,
    },
  };
}

/**
 * Validate MCP configuration
 */
export function validateMCPConfig(mode: MCPMode, config: MCPConfig): void {
  if (mode === 'browserbase' || mode === 'both') {
    if (config.browserbase.mode === 'cloud') {
      if (!config.browserbase.apiKey) {
        throw new Error('BROWSERBASE_API_KEY is required for browserbase cloud mode');
      }
      if (!config.browserbase.projectId) {
        throw new Error('BROWSERBASE_PROJECT_ID is required for browserbase cloud mode');
      }
    }
  }

  if (mode === 'playwright-mcp') {
    if (!config.playwrightMcp.url) {
      throw new Error('PLAYWRIGHT_MCP_URL is required for playwright-mcp mode');
    }
  }
}
