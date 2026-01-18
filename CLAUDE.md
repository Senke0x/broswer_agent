# CLAUDE.md - Project Guidelines for Claude Code

This file provides context and instructions for Claude Code when working on this project.

## Project Overview

**Airbnb Search Agent MVP** - A chat-based application that converts natural language into Airbnb search actions using browser automation (MCP).

### Key Features
- Chat UI for natural language search queries
- LLM-powered slot filling and intent parsing (OpenAI GPT-4/4o)
- Dual MCP backends: Browserbase (cloud) and Playwright (local)
- A/B evaluation mode for comparing both backends
- Top 10 listings with review summaries

## Tech Stack

- **Framework**: Next.js with TypeScript (App Router)
- **Styling**: Vanilla CSS (no Tailwind unless requested)
- **LLM**: OpenAI GPT-4/4o with function calling
- **Browser Automation**: MCP (Browserbase + Playwright)
- **Deployment**: Vercel (serverless)

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/chat/route.ts   # Streaming chat endpoint (SSE)
│   ├── page.tsx            # Main chat UI
│   └── layout.tsx
├── components/
│   ├── Chat/               # Chat UI components
│   └── ui/                 # Shared components
├── lib/
│   ├── mcp/                # MCP adapters (browserbase.ts, playwright.ts)
│   ├── llm/                # LLM planner, summarizer, schemas
│   ├── scraper/            # Selectors and extraction logic
│   └── evaluator.ts        # A/B comparison
├── types/                  # TypeScript types
└── config/                 # Configuration files
```

## Key Design Decisions

### Slot Filling
- **Required fields**: location, checkIn (ISO date), checkOut (ISO date)
- **Optional fields**: guests (default: 2), budget (per night), currency
- **Holiday/relative dates**: Must be inferred and confirmed with user

### Search Behavior
- **No budget**: Return 5 high-price + 5 mid-range, sorted high to low
- **With budget**: Filter within range, relax +15% if < 10 results
- **Reviews**: Extract >= 10 reviews per listing from detail pages

### MCP Adapters
- Common interface: `searchAirbnb(params) -> Listing[]`
- Retry once on failure, fallback to other backend if available
- Health check for failover decisions

### Streaming
- Use Server-Sent Events (SSE) for chat responses
- Stream partial results when possible

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Type check
npm run type-check

# Build for production
npm run build
```

## Environment Variables

Create `.env.local` with:
```
OPENAI_API_KEY=sk-...
BROWSERBASE_API_KEY=...           # Optional, for Browserbase MCP
PLAYWRIGHT_WS_ENDPOINT=...        # Optional, for remote Playwright
```

## Code Style Guidelines

### TypeScript
- Use strict TypeScript with explicit types
- Prefer interfaces over types for object shapes
- Use Zod for runtime validation at boundaries

### React Components
- Functional components with hooks
- Props interfaces defined above component
- Use `use client` directive only when needed

### Error Handling
- Use AppError type with ErrorCode enum
- Provide user-friendly messages (userMessage field)
- Mark errors as retryable or not

### Logging
- Structured JSON logs with LogEntry format
- Include traceId for request tracing
- Log duration for performance metrics

## MCP Integration Notes

### Playwright Adapter
- Runs locally on server
- Requires Playwright installed (`npx playwright install`)
- Use `browser.newContext()` for isolation

### Browserbase Adapter
- Cloud-hosted browser
- API key required
- Higher reliability, but adds latency

### Selector Configuration
- Store CSS selectors in `config/selectors.json`
- Update when Airbnb UI changes
- Add fallback selectors when possible

## Anti-Scraping Considerations

- Add 1-2s random delay between requests
- Limit detail page concurrency to 3
- Implement 30-60s cooldown on detection
- Rotate user agents if needed

## Testing Approach

- Unit tests for LLM schema parsing
- Integration tests for MCP adapters (mock browser)
- E2E tests for critical flows (optional for MVP)

## Common Tasks

### Adding a new LLM function
1. Define schema in `lib/llm/schemas.ts`
2. Add handler in `lib/llm/planner.ts`
3. Update ToolCall type

### Updating Airbnb selectors
1. Edit `config/selectors.json`
2. Test with both MCP backends
3. Add fallback selectors if needed

### Adding new MCP backend
1. Implement MCPAdapter interface
2. Add to adapter factory in `lib/mcp/adapter.ts`
3. Update MCPConfig type

## Open Questions

See `DESIGN.md` section "Open Questions & Clarifications Needed" for:
- Q1-Q3: MCP configuration details
- Q4-Q6: LLM strategy choices
- Q7-Q9: Scraping parameters
- Q10-Q11: Frontend priorities
- Q12-Q13: Security settings

## Reference Documents

- `DESIGN.md`: Full product and architecture specification
- `AGENTS.md`: Agent skills and trigger rules
