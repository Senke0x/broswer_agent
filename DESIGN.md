# Airbnb Search Agent MVP - Product + Architecture

## Context
Build a chat-based MVP that turns natural language into Airbnb search actions,
executes browser automation via MCP, and returns a ranked list summary.

## Goals
- Chat UI that collects missing inputs (location + dates required).
- Use LLM (OpenAI GPT-4/4o) to parse intent, ask clarifying questions, and
  decompose into MCP actions.
- Support two MCP backends: Browserbase MCP and Playwright MCP.
- Provide A/B evaluation mode comparing both MCP outputs.
- No auth, no persistence, deployed on Vercel.

## Non-Goals (for MVP)
- User accounts, favorites, or saved searches.
- Detailed listing pages or booking flows.
- Long-term storage or analytics beyond basic logs.

## Assumptions
- Default guests = 2 if not provided.
- Dates must be present with explicit month/day; if user provides a holiday or
  relative date, infer and ask for confirmation.
- Budget is per night in the local currency.
- If no budget is provided: return 10 results with wide price spread
  (5 high, 5 mid), ordered by price (high to low).
- If budget is provided: filter results within budget and order by price
  (high to low).
- Review summaries come from listing detail reviews (10+ when available,
  otherwise all).

## User Flow (Chat)
1. User asks: "Search Airbnb in Tokyo next weekend."
2. Agent extracts location and dates. If missing or relative/holiday, ask
   targeted questions to confirm explicit month/day.
3. Agent builds a search plan and selects MCP mode:
   - playwright (local), browserbase (cloud), or both (eval).
4. MCP runs search and extracts candidate listings.
5. Agent opens listing detail pages to extract >= 10 reviews per listing
   (or all if fewer) and summarizes them.
6. Agent post-processes results (filter/balance prices, order high to low).
7. Agent replies with top 10 summary cards.

## Core Functional Requirements
- Natural language understanding and slot filling:
  - Required: location, check-in, check-out.
  - Optional: budget (per night, local currency), guests, preferences.
- Clarifying questions until required slots are filled; relative/holiday dates
  must be confirmed into explicit month/day.
- MCP execution:
  - Both backends implemented with a consistent adapter interface.
  - Run in parallel for eval mode and compare outputs.
- Airbnb search:
  - Use website search with filters (location, dates, guests, budget).
  - Extract top 10 listing summaries and review data from detail pages.
- Output:
  - For each listing: title, price (per night, local currency), rating,
    review summary (>= 10 reviews if available), URL.
  - Sort results by price high to low.
- Error handling:
  - If MCP fails, retry once; fallback to the other backend if available.
  - If search results are sparse, relax filters and communicate.

## Evaluation (A/B)
Run both MCPs and compare:
- Result completeness (count >= 10).
- Extraction accuracy (fields present).
- Price spread coverage.
- Time-to-first-result and total runtime.
Expose the comparison to users (side-by-side or toggle). Store eval logs in
server logs for now (no persistence).

## Tech Architecture

### Frontend (Next.js / T3)
- Chat UI with streaming responses.
- Local state for conversation context (no persistence).
- Message rendering for:
  - assistant questions
  - user replies
  - search results cards

### Backend (T3 / tRPC or API Routes)
- Chat orchestration endpoint (e.g., `/api/chat` or tRPC `chat.run`).
- LLM planner:
  - Extract slots and determine next action.
  - Output a structured plan with tool calls.
- MCP adapters:
  - `BrowserbaseAdapter` and `PlaywrightAdapter`.
  - Common interface: `searchAirbnb(params) -> Listing[]`.
- Evaluator:
  - Optionally run both adapters in parallel.
  - Score and select winner; include comparison in debug logs.

### LLM Layer
- OpenAI GPT-4/4o for:
  - Slot filling
  - Follow-up question generation
  - Result summarization
- Use tool/function calling for structured outputs:
  - `collectSearchParams`
  - `searchAirbnb`
  - `summarizeListings`

### MCP Integration
- Browserbase MCP:
  - Cloud-hosted browser.
  - Requires API key in env.
- Playwright MCP:
  - Local browser on the server.
  - Requires Playwright installed and MCP server running.

### Data Flow (High-level)
User -> Chat UI -> LLM Planner -> MCP Adapter(s) -> Extract Listings ->
Post-process -> Response to UI.

## Data Model (Ephemeral)
SearchParams:
- location (string)
- checkIn (ISO date)
- checkOut (ISO date)
- guests (number, default 2)
- budgetMin (number | null, per night)
- budgetMax (number | null, per night)
- currency (string | null, ISO 4217)

Listing:
- title (string)
- pricePerNight (number)
- currency (string)
- rating (number | null)
- reviewCount (number | null)
- reviewSummary (string | null)
- url (string)

## Post-Processing Rules
- If no budget:
  - Pick 5 highest + 5 mid-range (median window).
  - Sort output by price high to low.
- If budget:
  - Filter within budget range.
  - If fewer than 10 results, relax upper bound by +15% and note it.
  - Sort output by price high to low.
- De-duplicate by URL or title.

## Risks & Mitigations
- Airbnb UI changes: keep selectors configurable; add retry/fallback.
- Rate limits/bot detection: add delays and randomization in MCP flows.
- Latency: stream partial results if possible.
- Detail page scraping increases risk; cap concurrency and add backoff.

## Deployment
- Vercel for Next.js app.
- Environment variables:
  - OPENAI_API_KEY
  - BROWSERBASE_API_KEY (if using Browserbase)
  - MCP endpoints/ports for Playwright

## Open Questions & Clarifications Needed ✅ CONFIRMED

### MCP Integration
- [x] **Q1**: Browserbase MCP 的 WebSocket/HTTP endpoint 格式是什么？需要确认 API 版本。
  - **答案**: 使用最新版本 `@browserbasehq/mcp-server-browserbase`，通过 `npx` 启动
- [x] **Q2**: Playwright MCP server 的启动命令和端口配置？是否需要支持多实例？
  - **答案**: 在仓库中新增 `mcp-server/` 目录，手动启动单个实例，默认端口 3001
- [x] **Q3**: MCP 适配器的重试策略：重试间隔（建议 2s/5s/10s 指数退避）和最大重试次数？
  - **答案**: 重试间隔 5s，最大 6 次

### LLM Layer
- [x] **Q4**: Streaming 实现方式选择：SSE (简单) vs WebSocket (双向)？建议 SSE。
  - **答案**: SSE (Server-Sent Events)
- [x] **Q5**: 对话历史保留多少轮？建议最近 10 轮，token 限制 4000。
  - **答案**: 保留 10 轮
- [x] **Q6**: GPT-4 vs GPT-4o 的选择策略？建议 slot filling 用 4o（快），summarization 用 4（质量）。
  - **答案**: 统一使用 GPT-4o

### Scraping Strategy
- [x] **Q7**: 详情页并发数上限？建议 3 并发，间隔 1-2s 随机延迟。
  - **答案**: 3 并发
- [x] **Q8**: 选择器配置化存储位置？建议 `config/selectors.json`。
  - **答案**: 同意，使用 `config/selectors.json`
- [x] **Q9**: 反爬检测后的冷却时间？建议 30s-60s。
  - **答案**: 30s

### Frontend
- [x] **Q10**: 是否需要 loading skeleton 动画？建议是。
  - **答案**: 是
- [x] **Q11**: 移动端响应式支持优先级？
  - **答案**: 不支持移动端

### Security & Rate Limiting
- [x] **Q12**: 单用户每分钟请求上限？建议 10 次/分钟。
  - **答案**: 10 次/分钟
- [x] **Q13**: API Key 管理：是否使用 Vercel Edge Config 或环境变量？
  - **答案**: 环境变量

---

## Technical Specifications (Detailed)

### Message Schema
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    toolCalls?: ToolCall[];
    searchResults?: Listing[];
    mcpMode?: 'playwright' | 'browserbase' | 'both';
  };
}

interface ToolCall {
  name: 'collectSearchParams' | 'searchAirbnb' | 'summarizeListings';
  arguments: Record<string, unknown>;
  result?: unknown;
}
```

### MCP Adapter Interface
```typescript
interface MCPAdapter {
  name: 'browserbase' | 'playwright';

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  searchAirbnb(params: SearchParams): Promise<Listing[]>;
  getListingDetails(url: string): Promise<ListingDetail>;

  // Health check for failover
  healthCheck(): Promise<boolean>;
}

interface MCPConfig {
  browserbase: {
    apiKey: string;
    endpoint: string;
    timeout: number; // default 30000ms
  };
  playwright: {
    wsEndpoint?: string;
    launchOptions?: LaunchOptions;
    timeout: number; // default 30000ms
  };
}
```

### LLM Function Schemas
```typescript
const collectSearchParamsSchema = {
  name: 'collectSearchParams',
  description: 'Extract search parameters from user input',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City or region name' },
      checkIn: { type: 'string', format: 'date', description: 'ISO date YYYY-MM-DD' },
      checkOut: { type: 'string', format: 'date', description: 'ISO date YYYY-MM-DD' },
      guests: { type: 'number', default: 2 },
      budgetMin: { type: 'number', nullable: true },
      budgetMax: { type: 'number', nullable: true },
      currency: { type: 'string', default: 'USD' },
      missingFields: { type: 'array', items: { type: 'string' } },
      clarificationNeeded: { type: 'string', nullable: true }
    },
    required: ['location']
  }
};
```

### Error Handling Strategy
```typescript
enum ErrorCode {
  MCP_CONNECTION_FAILED = 'MCP_001',
  MCP_TIMEOUT = 'MCP_002',
  SCRAPING_BLOCKED = 'SCRAPE_001',
  RATE_LIMITED = 'RATE_001',
  INVALID_PARAMS = 'PARAM_001',
  LLM_ERROR = 'LLM_001'
}

interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string; // User-friendly message in current locale
  retryable: boolean;
  details?: unknown;
}
```

### Logging Format
```typescript
interface LogEntry {
  timestamp: string; // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  service: 'chat' | 'mcp' | 'llm' | 'scraper';
  event: string;
  duration?: number; // ms
  metadata?: Record<string, unknown>;
  traceId?: string;
}
```

### A/B Evaluation Metrics
```typescript
interface EvalResult {
  sessionId: string;
  timestamp: string;
  searchParams: SearchParams;
  results: {
    playwright?: {
      listings: Listing[];
      timeToFirstResult: number;
      totalTime: number;
      errors: string[];
    };
    browserbase?: {
      listings: Listing[];
      timeToFirstResult: number;
      totalTime: number;
      errors: string[];
    };
  };
  comparison: {
    winner: 'playwright' | 'browserbase' | 'tie';
    completenessScore: { playwright: number; browserbase: number };
    accuracyScore: { playwright: number; browserbase: number };
    speedScore: { playwright: number; browserbase: number };
  };
}
```

---

## Project Structure (Proposed)
```
/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts    # Streaming chat endpoint
│   │   ├── page.tsx            # Main chat UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── InputBar.tsx
│   │   │   └── ListingCard.tsx
│   │   └── ui/                 # Shared UI components
│   ├── lib/
│   │   ├── mcp/
│   │   │   ├── adapter.ts      # Base adapter interface
│   │   │   ├── browserbase.ts
│   │   │   └── playwright.ts
│   │   ├── llm/
│   │   │   ├── planner.ts      # Slot filling & planning
│   │   │   ├── summarizer.ts   # Review summarization
│   │   │   └── schemas.ts      # Function call schemas
│   │   ├── scraper/
│   │   │   ├── selectors.ts    # CSS selectors config
│   │   │   └── extractor.ts    # Data extraction logic
│   │   └── evaluator.ts        # A/B comparison logic
│   ├── types/
│   │   ├── chat.ts
│   │   ├── listing.ts
│   │   └── mcp.ts
│   └── config/
│       └── selectors.json      # Airbnb selectors (configurable)
├── public/
├── DESIGN.md
├── CLAUDE.md
├── package.json
└── .env.example
```

---

## TODO (Implementation)

### Phase 1: Foundation
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up project structure and types
- [ ] Implement basic chat UI with streaming (SSE)
- [ ] Add message rendering (user/assistant/system)

### Phase 2: LLM Integration
- [ ] Implement LLM planner (slot filling + tool calls)
- [ ] Add function calling schemas
- [ ] Add holiday/relative date inference + confirmation prompts
- [ ] Implement review summarization

### Phase 3: MCP & Scraping
- [ ] Implement MCP adapter interface
- [ ] Implement Playwright adapter
- [ ] Implement Browserbase adapter
- [ ] Add Airbnb scraping logic with configurable selectors
- [ ] Add detail-page review extraction (>= 10 reviews)
- [ ] Implement retry and failover logic

### Phase 4: Post-processing & Evaluation
- [ ] Add result post-processing (filter/balance/sort)
- [ ] Add eval harness for A/B comparison
- [ ] Add user-visible A/B comparison view
- [ ] Add structured logging

### Phase 5: Polish
- [ ] Add loading states and skeleton UI
- [ ] Add error handling and user-friendly messages
- [ ] Add rate limiting
- [ ] Deploy to Vercel

---

## Implementation Progress (2026-01-18)

### ✅ Completed

#### Phase 1: Foundation (Complete)
- [x] Initialize Next.js project with TypeScript
- [x] Install dependencies: openai, zod, uuid, @modelcontextprotocol/sdk
- [x] Create type definitions:
  - `src/types/chat.ts` - ChatMessage, ToolCall
  - `src/types/listing.ts` - Listing, ListingDetail, SearchParams
  - `src/types/mcp.ts` - MCPAdapter interface, MCPConfig
  - `src/types/eval.ts` - EvalResult, EvalMetrics
- [x] Create core utilities:
  - `src/lib/errors/types.ts` - ErrorCode enum, ApplicationError
  - `src/lib/errors/handler.ts` - Error handling utilities
  - `src/lib/utils/logger.ts` - Structured logging
  - `src/config/constants.ts` - App configuration
- [x] Create UI components:
  - `src/app/globals.css` - Design system and CSS variables
  - `src/components/ui/Skeleton.tsx` - Loading skeleton with animation
  - `src/components/ui/Button.tsx` - Reusable button component
  - `src/components/ui/Card.tsx` - Card container component
- [x] Create Chat components:
  - `src/components/Chat/InputBar.tsx` - Chat input with send button
  - `src/components/Chat/MessageBubble.tsx` - Message bubble component
  - `src/components/Chat/ListingCard.tsx` - Listing card for search results
  - `src/components/Chat/MessageList.tsx` - Message list with auto-scroll
  - `src/components/Chat/ChatContainer.tsx` - Main chat container
- [x] Create hooks:
  - `src/hooks/useSSE.ts` - SSE connection hook with cleanup
  - `src/hooks/useChat.ts` - Chat state management with streaming
- [x] Create utilities:
  - `src/lib/chat/sse-encoder.ts` - SSE response encoder
- [x] Create API routes:
  - `src/app/api/chat/route.ts` - SSE streaming endpoint (placeholder)
- [x] Update app structure:
  - `src/app/page.tsx` - Main chat page with ChatContainer
  - `src/app/layout.tsx` - Root layout with app metadata

#### Code Quality & Optimization
- [x] Vercel React Best Practices Review:
  - Fixed array index keys (use stable listing.url)
  - Fixed stale closures in useChat hook
  - Fixed mutation outside React state
  - Added React.memo to MessageList
  - Optimized useEffect dependencies
- [x] Bug Fixes (Codex Review):
  - Fixed EventSource memory leak (cleanup function not called)
  - Fixed stale ref after connection close
  - Added cleanup on component unmount
  - Removed unused variables
- [x] Build verification: All TypeScript checks passed

### 📋 Next Steps

1. ✅ ~~Complete Phase 1: Foundation~~ (DONE)
2. **Begin Phase 2: LLM Integration**
   - Implement LLM planner (slot filling + tool calls)
   - Add function calling schemas
   - Add holiday/relative date inference + confirmation prompts
   - Implement review summarization
3. Implement Phase 3: MCP & Scraping
4. Add Phase 4: Post-processing & Evaluation
5. Polish Phase 5: Final touches

### 📦 MCP Packages Confirmed

- **Browserbase**: `@browserbasehq/mcp-server-browserbase` (latest)
- **Playwright**: `@playwright/mcp@latest`
- **MCP Directory**: `mcp-server/` (manual startup)

### 🔧 Configuration Confirmed

| Parameter | Value |
|-----------|-------|
| Retry Strategy | 5s interval, max 6 attempts |
| Streaming | SSE (Server-Sent Events) |
| History | 10 rounds |
| LLM Model | GPT-4o |
| Detail Concurrency | 3 |
| Cooldown | 30s |
| Rate Limit | 10 req/min |
| Mobile Support | No |
