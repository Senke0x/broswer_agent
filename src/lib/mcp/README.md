# MCP (Model Context Protocol) Setup

This directory contains the MCP adapter implementations for browser automation in the Airbnb Search Agent project.

## Overview

Browser automation backends supported:

1. **Browserbase MCP** - Cloud-based browser automation for web scraping and interaction
2. **Playwright (Direct)** - Local Playwright automation without MCP
3. **Playwright MCP** - Local MCP server for Playwright automation (HTTP/SSE)

Additional MCP servers (development tooling):
- **Context7 MCP** - Provides real-time, version-specific documentation access to AI assistants

## Configuration

### MCP Servers (`.mcp.json`)

The following MCP servers are configured:

- `context7` - Documentation access via `@upstash/context7-mcp`
- `browserbase` - Browser automation via `@browserbasehq/mcp-server-browserbase`
- `filesystem`, `git`, `github` - Standard MCP servers

Playwright MCP runs as a local service and is started separately (see `scripts/start-playwright-mcp.ts`).

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
# Required for Browserbase
BROWSERBASE_API_KEY=your-api-key
BROWSERBASE_PROJECT_ID=your-project-id

# Optional for Context7 (works without but has rate limits)
CONTEXT7_API_KEY=your-context7-api-key

# Playwright MCP (local server)
PLAYWRIGHT_MCP_URL=http://127.0.0.1:3001
PLAYWRIGHT_MCP_HOST=127.0.0.1
PLAYWRIGHT_MCP_PORT=3001
PLAYWRIGHT_MCP_BROWSER=chromium
PLAYWRIGHT_MCP_HEADLESS=true
PLAYWRIGHT_MCP_NO_SANDBOX=true
```

Get your credentials:
- Browserbase: https://www.browserbase.com/dashboard
- Context7: https://context7.com

## Architecture

### Adapter Pattern

The MCP adapters follow a common interface defined in `@/types/mcp.ts`:

```typescript
interface MCPAdapter {
  readonly name: 'browserbase' | 'playwright' | 'playwright-mcp';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<boolean>;
  searchAirbnb(params: SearchParams): Promise<Listing[]>;
  getListingDetails(url: string): Promise<ListingDetail>;
  getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]>;
}
```

### Files

- `adapter.ts` - Factory and configuration utilities
- `browserbase.ts` - Browserbase MCP adapter implementation
- `playwright.ts` - Playwright adapter (direct browser control)
- `playwright-mcp.ts` - Playwright MCP adapter (HTTP/SSE)
- `example.ts` - Usage examples

## Usage

### Basic Usage

```typescript
import { createMCPAdapter, getDefaultMCPConfig } from '@/lib/mcp/adapter';

const config = getDefaultMCPConfig();
const adapter = createMCPAdapter('browserbase', config);

await adapter.connect();
const listings = await adapter.searchAirbnb({
  location: 'San Francisco, CA',
  checkIn: '2026-02-01',
  checkOut: '2026-02-05',
  guests: 2,
});
await adapter.disconnect();
```

### Playwright MCP Usage

```typescript
const config = getDefaultMCPConfig();
const adapter = createMCPAdapter('playwright-mcp', config);
```

### A/B Testing Mode

```typescript
const adapters = createMCPAdapter('both', config);
// Returns array of [BrowserbaseAdapter, PlaywrightAdapter]
```

## Next Steps

1. **Set up environment variables** - Add your Browserbase credentials to `.env.local`
2. **Implement search logic** - Complete the `searchAirbnb()` methods in adapters
3. **Add scraping logic** - Implement `getListingDetails()` for detail page extraction
4. **Test the integration** - Run the example usage scripts

## Testing

These MCP servers have been verified to work:

```bash
# Test Context7
npx -y @upstash/context7-mcp@latest --help

# Test Browserbase
npx -y @browserbasehq/mcp-server-browserbase --help

# Start Playwright MCP locally (HTTP/SSE)
npm run mcp:playwright
```

## Resources

- [Model Context Protocol Docs](https://modelcontextprotocol.io)
- [Browserbase MCP Server](https://github.com/browserbase/mcp-server-browserbase)
- [Playwright MCP Server](https://github.com/microsoft/playwright-mcp)
- [Context7 Documentation](https://context7.com/docs)
