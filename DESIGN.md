# Airbnb Search Agent MVP - Product + Architecture

## Context
Build a chat-based MVP that turns natural language into Airbnb search actions,
executes browser automation via MCP, and returns a ranked list summary.

## Goals
- Chat UI that collects missing inputs (location + dates required).
- Use LLM (OpenAI GPT-4/4o) to parse intent, ask clarifying questions, and
  decompose into MCP actions.
- Support three MCP backends: Browserbase MCP, Playwright (direct), and Playwright MCP.
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
   - playwright (direct), playwright-mcp (server), browserbase (cloud), or both (eval).
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
- MCP mode selector (Playwright / Playwright MCP / Browserbase / A/B evaluation).

### Backend (T3 / tRPC or API Routes)
- Chat orchestration endpoint (e.g., `/api/chat` or tRPC `chat.run`).
- LLM planner:
  - Extract slots and determine next action.
  - Output a structured plan with tool calls.
- MCP adapters:
  - `BrowserbaseAdapter`, `PlaywrightAdapter`, and `PlaywrightMcpAdapter`.
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

#### Browserbase MCP - Dual Mode Support (NEW)

The Browserbase adapter now supports two modes:

**Cloud Mode (Default)**
- Uses `@browserbasehq/mcp-server-browserbase` MCP server
- Requires `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`
- Hosted browser infrastructure with CAPTCHA solving
- Communication via StdioClientTransport

**Local Mode (NEW - Stagehand SDK v3)**
- Uses `@browserbasehq/stagehand` SDK directly to control local Chrome
- Set `BROWSERBASE_MODE=local` to enable
- Automatic Chrome launch with customizable options
- Full feature parity: screenshots, visual feedback, headless toggle
- Uses Chrome DevTools Protocol (CDP) directly, no Playwright dependency

```typescript
// Mode selection in config
interface BrowserbaseConfig {
  mode: 'cloud' | 'local';      // NEW: mode selection
  // Cloud mode config
  apiKey: string;
  projectId: string;
  timeout: number;
  // Local mode config
  localOptions?: {              // NEW: local mode options
    headless: boolean;
    executablePath?: string;    // Custom Chrome path
    userDataDir?: string;       // Chrome profile directory
  };
}
```

#### Playwright MCP
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
  - BROWSERBASE_API_KEY (if using Browserbase cloud mode)
  - BROWSERBASE_PROJECT_ID (if using Browserbase cloud mode)
  - BROWSERBASE_MODE=local|cloud (default: cloud)
  - STAGEHAND_HEADLESS=true|false (local mode only, default: true)
  - CHROME_EXECUTABLE_PATH (local mode only, optional)
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
    mcpMode?: 'playwright' | 'playwright-mcp' | 'browserbase' | 'both';
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
  name: 'browserbase' | 'playwright' | 'playwright-mcp';

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
    mode: 'cloud' | 'local';      // NEW: mode selection
    // Cloud mode config
    apiKey: string;
    projectId: string;
    timeout: number; // default 30000ms
    // Local mode config
    localOptions?: {              // NEW: local mode options
      headless: boolean;
      executablePath?: string;    // Custom Chrome path
      userDataDir?: string;       // Chrome profile directory
    };
  };
  playwright: {
    port: number;                 // default 3001
    browser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    timeout: number; // default 30000ms
  };
  playwrightMcp: {
    url: string;
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
- [x] Implement LLM planner (slot filling + tool calls)
- [x] Add function calling schemas
- [x] Add holiday/relative date inference + confirmation prompts
- [x] Implement review summarization

### Phase 3: MCP & Scraping
- [x] Implement MCP adapter interface
- [x] Implement Playwright adapter
- [x] Implement Browserbase adapter
- [x] Add Airbnb scraping logic with configurable selectors
- [x] Add detail-page review extraction (>= 10 reviews)
- [x] Implement retry and failover logic

### Phase 4: Post-processing & Evaluation
- [x] Add result post-processing (filter/balance/sort)
- [x] Add eval harness for A/B comparison
- [x] Add user-visible A/B comparison view
- [x] Add structured logging

### Phase 5: Polish
- [x] Add loading states and skeleton UI
- [x] Add error handling and user-friendly messages
- [x] Add rate limiting
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

#### Phase 2: LLM Integration (Complete)
- [x] Create LLM function schemas:
  - `src/lib/llm/schemas.ts` - collectSearchParams, searchAirbnb, summarizeListings
  - OpenAI function calling schemas with proper parameter validation
  - Support for slot filling, clarification questions, and search execution
- [x] Implement LLM planner:
  - `src/lib/llm/planner.ts` - Intent parsing and slot filling logic
  - Handles collectSearchParams and searchAirbnb function calls
  - Returns structured PlanResult with action type and parameters
  - Validates required fields (location, checkIn, checkOut)
  - Generates clarification questions for missing information
- [x] Implement review summarizer:
  - `src/lib/llm/summarizer.ts` - Review summarization using OpenAI
  - Summarizes up to 15 reviews into 2-3 sentences
  - Focuses on common themes, pros, and cons
- [x] Create OpenAI client utility:
  - `src/lib/llm/client.ts` - Shared OpenAI client with lazy initialization
  - Prevents build-time initialization errors
  - Exports DEFAULT_MODEL (gpt-4o) and DEFAULT_TEMPERATURE
- [x] Update API route:
  - `src/app/api/chat/route.ts` - Integrated LLM planner
  - Streams clarification questions or search parameters
  - Placeholder for Phase 3 MCP integration
- [x] Bug fixes:
  - Fixed OpenAI tool call type errors with type guards
  - Implemented lazy initialization pattern for API clients
  - Resolved build-time vs runtime initialization issues
- [x] Build verification: All TypeScript checks passed

#### Phase 3: MCP & Scraping (Complete)
- [x] Create MCP adapter interface and types:
  - `src/types/mcp.ts` - MCPAdapter interface, MCPConfig, tool types
  - Defined common interface for both Browserbase and Playwright adapters
- [x] Create base adapter class:
  - `src/lib/mcp/base.ts` - BaseMCPAdapter with common functionality
  - Implements retry logic with exponential backoff
  - Batch processing with concurrency control (max 3)
  - Random delays to avoid rate limiting
- [x] Create selector configuration:
  - `src/config/selectors.json` - Airbnb CSS selectors
  - Primary and fallback selectors for search and detail pages
- [x] Implement Browserbase adapter:
  - `src/lib/mcp/browserbase.ts` - Full MCP integration
  - Uses @modelcontextprotocol/sdk for MCP client
  - Implements searchAirbnb with navigation and extraction
  - Implements getListingDetails with review extraction (up to 15 reviews)
- [x] Implement Playwright adapter:
  - `src/lib/mcp/playwright.ts` - Full MCP integration
  - Uses @modelcontextprotocol/sdk for MCP client
  - Implements searchAirbnb with DOM evaluation
  - Implements getListingDetails with review extraction
- [x] Build verification: All TypeScript checks passed

#### Phase 4: Post-processing & Evaluation (Complete)
- [x] Post-processing pipeline (dedupe, budget filter, price sorting)
- [x] Eval harness for A/B comparison (metrics + winner selection)
- [x] User-visible comparison UI + mode selector
- [x] Structured logging for eval results

#### Phase 5: Polish (In Progress)
- [x] Loading states and skeleton UI
- [x] Error handling with user-friendly messages
- [x] Rate limiting (10 req/min)
- [ ] Deploy to Vercel

#### Phase 6: Stagehand Local Chrome Integration (In Progress - 2026-01-19)

**Goal**: Modify BrowserbaseAdapter to support dual modes (cloud + local) using Stagehand SDK v3

**Completed**:
- [x] Install `@browserbasehq/stagehand` v3 dependency
- [x] Update type definitions in `src/types/mcp.ts`:
  - Added `mode: 'cloud' | 'local'` to BrowserbaseConfig
  - Added `localOptions` with headless, executablePath, userDataDir
- [x] Refactor `src/lib/mcp/browserbase.ts` (partial):
  - Added Stagehand SDK imports
  - Updated BrowserbaseConfig interface
  - Added dual-mode class properties (stagehand, page, screenshotCallback)
  - Implemented `connect()` with mode routing
  - Implemented `connectLocal()` using Stagehand SDK
  - Implemented `connectCloud()` (existing MCP server approach)
  - Implemented `injectVisualFeedback()` for local mode
  - Updated `disconnect()` for dual-mode support

**In Progress**:
- [ ] Complete `src/lib/mcp/browserbase.ts` refactoring:
  - Implement `searchAirbnb()` dual-mode routing
  - Implement `searchAirbnbLocal()` using Stagehand page.goto() and page.extract()
  - Implement `healthCheck()` dual-mode support
  - Implement `takeScreenshot()` for both modes
  - Implement `setScreenshotCallback()` method
  - Implement `getListingDetails()` dual-mode routing
  - Implement `getListingDetailsLocal()` using Stagehand

**Pending**:
- [ ] Update `src/lib/mcp/adapter.ts` factory function:
  - Add BROWSERBASE_MODE environment variable support
  - Add STAGEHAND_HEADLESS environment variable support
  - Add CHROME_EXECUTABLE_PATH environment variable support
- [ ] Create `.env.example` with new variables
- [ ] Testing:
  - Test local mode with headless=false
  - Test screenshot callbacks
  - Test A/B evaluation with all three backends
- [ ] Documentation:
  - Update DESIGN.md with usage examples
  - Update CLAUDE.md with Stagehand integration notes

### 📋 Next Steps

1. ✅ ~~Complete Phase 1: Foundation~~ (DONE)
2. ✅ ~~Complete Phase 2: LLM Integration~~ (DONE)
3. ✅ ~~Complete Phase 3: MCP & Scraping~~ (DONE)
4. ✅ ~~Complete Phase 4: Post-processing & Evaluation~~ (DONE)
5. **Phase 5: Polish** (In Progress)
   - Deploy to Vercel
6. **Phase 6: Stagehand Local Chrome Integration** (In Progress)
   - Complete browserbase.ts refactoring (searchAirbnb, healthCheck, screenshots, getListingDetails)
   - Update adapter factory with environment variable support
   - Create .env.example with new variables
   - Testing and validation

### 📦 MCP Packages Confirmed

- **Browserbase Cloud Mode**: `@browserbasehq/mcp-server-browserbase` (latest)
- **Browserbase Local Mode**: `@browserbasehq/stagehand` v3 (NEW)
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
| Browserbase Mode | cloud (default) or local |
| Stagehand Headless | true (default) |

---

## Stagehand Local Chrome Integration Architecture (2026-01-19)

### Overview

This section documents the architecture design for integrating Stagehand SDK v3 into the BrowserbaseAdapter to support local Chrome automation alongside the existing cloud-based MCP server approach.

### Design Goals

1. **Backward Compatibility**: Existing cloud mode users should be unaffected
2. **Feature Parity**: Local mode should support all features (screenshots, visual feedback, A/B eval)
3. **Flexibility**: Easy mode switching via environment variable
4. **Modern Stack**: Use Stagehand v3 with CDP (no Playwright dependency)
5. **Maintainability**: Single adapter handles both modes with clear separation

### Dual-Mode Architecture

```
BrowserbaseAdapter
├── mode: 'cloud' | 'local'
│
├── Cloud Mode (existing)
│   ├── Uses MCP SDK (StdioClientTransport)
│   ├── Spawns @browserbasehq/mcp-server-browserbase
│   └── Calls tools: browserbase_stagehand_navigate, browserbase_stagehand_extract
│
└── Local Mode (new)
    ├── Uses Stagehand SDK v3 directly
    ├── Manages Chrome lifecycle automatically
    └── Uses page.goto(), page.extract() with natural language
```

### Class Structure

```typescript
export class BrowserbaseAdapter implements MCPAdapter {
  readonly name = 'browserbase' as const;
  private mode: 'cloud' | 'local';

  // Cloud mode (existing)
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  // Local mode (new)
  private stagehand: Stagehand | null = null;
  private page: any = null; // Stagehand page instance

  private config: BrowserbaseConfig;
  private connected = false;
  private screenshotCallback?: (base64: string) => void;

  constructor(config: BrowserbaseConfig) {
    this.config = config;
    this.mode = config.mode || 'cloud';
  }
}
```

### Method Routing Pattern

Each public method routes to the appropriate implementation based on mode:

```typescript
async searchAirbnb(params: SearchParams): Promise<Listing[]> {
  if (this.mode === 'local') {
    return this.searchAirbnbLocal(params);
  }
  return this.searchAirbnbCloud(params);
}
```

### Key Implementation Details

#### Connection Methods

| Method | Cloud Mode | Local Mode |
|--------|------------|------------|
| `connect()` | Spawns MCP server via npx | Initializes Stagehand SDK |
| `disconnect()` | Closes MCP client | Closes Stagehand browser |
| `isConnected()` | Returns `this.connected` | Returns `this.connected` |
| `healthCheck()` | Lists MCP tools | Checks page/stagehand state |

#### Search Methods

| Method | Cloud Mode | Local Mode |
|--------|------------|------------|
| `searchAirbnb()` | Calls MCP `browserbase_stagehand_navigate` + `browserbase_stagehand_extract` | Uses `page.goto()` + `page.extract()` |
| `getListingDetails()` | Calls MCP tools for detail page | Uses `page.goto()` + `page.extract()` |

#### Screenshot & Visual Feedback

| Feature | Cloud Mode | Local Mode |
|---------|------------|------------|
| Screenshot | Calls `browserbase_screenshot` MCP tool | Uses `page.screenshot()` buffer |
| Visual Feedback | N/A (handled by cloud) | Injects CSS/JS via `page.evaluate()` |
| Cursor Overlay | N/A | Red dot following mouse |
| Focus Highlight | N/A | Blue outline on focused elements |

### Environment Variables

```bash
# Mode selection (default: cloud)
BROWSERBASE_MODE=local

# Cloud mode (existing)
BROWSERBASE_API_KEY=your-api-key
BROWSERBASE_PROJECT_ID=your-project-id

# Local mode (new)
STAGEHAND_HEADLESS=false
CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

### Stagehand v3 Key Features

- **No Playwright Dependency**: Uses Chrome DevTools Protocol (CDP) directly
- **Natural Language Extraction**: `page.extract({ instruction: '...' })`
- **Automatic Chrome Management**: Handles launch/close automatically
- **Built-in Wait Logic**: Smart waiting for page loads and elements

### Files Modified

| File | Status | Changes |
|------|--------|---------|
| `src/lib/mcp/browserbase.ts` | ✅ Partial | Dual-mode connect/disconnect, visual feedback |
| `src/types/mcp.ts` | ✅ Complete | Added mode and localOptions |
| `src/lib/mcp/adapter.ts` | ⏳ Pending | Factory function with env vars |
| `package.json` | ✅ Complete | Added @browserbasehq/stagehand |
| `.env.example` | ⏳ Pending | New environment variables |

### Remaining Implementation Tasks

1. **browserbase.ts** (Priority: High)
   - [ ] `searchAirbnb()` - Add mode routing
   - [ ] `searchAirbnbLocal()` - Implement with Stagehand
   - [ ] `healthCheck()` - Add local mode check
   - [ ] `takeScreenshot()` - Implement for both modes
   - [ ] `setScreenshotCallback()` - Add callback setter
   - [ ] `getListingDetails()` - Add mode routing
   - [ ] `getListingDetailsLocal()` - Implement with Stagehand

2. **adapter.ts** (Priority: Medium)
   - [ ] Update `getDefaultMCPConfig()` with env var support
   - [ ] Add mode detection from BROWSERBASE_MODE

3. **Testing** (Priority: High)
   - [ ] Test local mode Chrome launch
   - [ ] Test screenshot callbacks
   - [ ] Test A/B evaluation with Playwright vs Browserbase-local
   - [ ] Test headless vs headed modes

### Migration Notes

- Default mode is `cloud` for backward compatibility
- Users opt-in to local mode via `BROWSERBASE_MODE=local`
- Cloud mode requires API key; local mode does not
- Local mode is server-only (cannot run in browser)
