# Airbnb Search Agent MVP

A chat-based application that converts natural language queries into Airbnb search actions using browser automation via Model Context Protocol (MCP).

## 🎯 Project Overview

This MVP demonstrates an intelligent search agent that:
- Understands natural language queries like "Find me a place in Tokyo next weekend"
- Extracts and validates search parameters (location, dates, guests, budget)
- Executes browser automation to search Airbnb
- Scrapes listing details and reviews
- Returns top 10 results with AI-generated review summaries

## ✨ Key Features

### Natural Language Understanding
- **Slot Filling**: Extracts location, check-in/check-out dates, guests, and budget from conversational input
- **Clarifying Questions**: Asks follow-up questions when required information is missing
- **Date Inference**: Handles relative dates ("next weekend") and holidays with confirmation

### Multiple MCP Backend Support
- **Browserbase MCP**: Cloud-hosted browser automation (reliable, scalable)
- **Playwright (Direct)**: Local Playwright automation (fast, no external dependencies)
- **Playwright MCP**: Local MCP server using Playwright (HTTP/SSE)
- **A/B Evaluation Mode**: Run Browserbase + Playwright (direct) in parallel and compare results

### Intelligent Search & Scraping
- Automated Airbnb search with filters (location, dates, guests, budget)
- Detail page scraping for review extraction (10+ reviews per listing)
- Anti-detection measures (random delays, concurrency limits)
- Retry logic with exponential backoff

### Smart Post-Processing
- **No Budget**: Returns 5 high-price + 5 mid-range listings, sorted high to low
- **With Budget**: Filters within range, relaxes +15% if fewer than 10 results
- De-duplication and price-based sorting
- AI-powered review summarization (2-3 sentences per listing)

### Real-Time Streaming
- Server-Sent Events (SSE) for streaming responses
- Progressive result updates
- Loading states with skeleton UI

## 🛠 Tech Stack

- **Framework**: Next.js 16 with TypeScript (App Router)
- **Styling**: Vanilla CSS with CSS variables (no Tailwind)
- **LLM**: OpenAI GPT-4o with function calling
- **Browser Automation**: MCP SDK with Browserbase + Playwright (direct) + Playwright MCP adapters
- **Validation**: Zod for runtime type checking
- **Deployment**: Vercel (serverless)

## 📐 Architecture

### High-Level Flow

```
User Input → Chat UI → LLM Planner → MCP Adapter(s) → Airbnb Scraping
                ↓                                              ↓
         Clarification                                  Extract Listings
                ↓                                              ↓
         User Response                              Post-process & Summarize
                ↓                                              ↓
         [Loop until complete]  ←─────────────────  Display Results
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ChatContainer│  │  MessageList │  │  ListingCard │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                     useChat Hook (SSE)                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    Backend (Next.js API)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              /api/chat (SSE Endpoint)                 │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │              LLM Planner (OpenAI GPT-4o)             │   │
│  │  • Slot Filling  • Intent Parsing  • Summarization   │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │                 MCP Adapter Layer                     │   │
│  │  ┌──────────────────┐  ┌──────────────────┐         │   │
│  │  │ BrowserbaseAdapter│  │PlaywrightAdapter│         │   │
│  │  └──────────────────┘  └──────────────────┘         │   │
│  │  ┌──────────────────┐                               │   │
│  │  │PlaywrightMcpAdapter│                              │   │
│  │  └──────────────────┘                               │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │              Scraper & Post-processor                 │   │
│  │  • Selector Config  • Extraction  • Filtering        │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/chat/route.ts         # SSE streaming chat endpoint
│   ├── page.tsx                  # Main chat UI page
│   ├── layout.tsx                # Root layout with metadata
│   └── globals.css               # Global styles and CSS variables
│
├── components/
│   ├── Chat/                     # Chat-specific components
│   │   ├── ChatContainer.tsx     # Main chat container with mode selector
│   │   ├── MessageList.tsx       # Message list with auto-scroll
│   │   ├── MessageBubble.tsx     # Individual message bubble
│   │   ├── InputBar.tsx          # Chat input with send button
│   │   ├── ListingCard.tsx       # Listing result card
│   │   └── ComparisonView.tsx    # A/B comparison view
│   └── ui/                       # Shared UI components
│       ├── Button.tsx            # Reusable button component
│       ├── Card.tsx              # Card container component
│       └── Skeleton.tsx          # Loading skeleton animation
│
├── lib/
│   ├── mcp/                      # MCP adapter implementations
│   │   ├── adapter.ts            # Adapter factory and utilities
│   │   ├── base.ts               # Base adapter with retry logic
│   │   ├── browserbase.ts        # Browserbase MCP adapter
│   │   ├── playwright.ts         # Playwright direct adapter
│   │   └── playwright-mcp.ts     # Playwright MCP adapter
│   │
│   ├── llm/                      # LLM integration
│   │   ├── client.ts             # OpenAI client with lazy init
│   │   ├── planner.ts            # Slot filling and intent parsing
│   │   ├── summarizer.ts         # Review summarization
│   │   └── schemas.ts            # Function calling schemas
│   │
│   ├── search/                   # Search logic
│   │   └── postprocess.ts        # Result filtering and sorting
│   │
│   ├── chat/                     # Chat utilities
│   │   └── sse-encoder.ts        # SSE response encoder
│   │
│   ├── errors/                   # Error handling
│   │   ├── types.ts              # Error types and codes
│   │   └── handler.ts            # Error handling utilities
│   │
│   ├── utils/                    # Shared utilities
│   │   └── logger.ts             # Structured logging
│   │
│   └── evaluator.ts              # A/B comparison logic
│
├── types/                        # TypeScript type definitions
│   ├── chat.ts                   # Chat message types
│   ├── listing.ts                # Listing and search types
│   ├── mcp.ts                    # MCP adapter types
│   └── eval.ts                   # Evaluation types
│
├── config/
│   ├── constants.ts              # App configuration
│   └── selectors.json            # Airbnb CSS selectors
│
└── hooks/                        # React hooks
    ├── useChat.ts                # Chat state management
    └── useSSE.ts                 # SSE connection hook
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key (required)
- Browserbase account (optional, for cloud browser automation)
- Playwright (optional, for local browser automation)
- Playwright MCP server (optional, for MCP mode)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd broswer_agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your API keys (see Environment Variables section below).

4. **Install Playwright browsers** (if using Playwright direct or Playwright MCP)
   ```bash
   npx playwright install chromium
   ```

### Running the Application

#### Development Mode

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

If you use `playwright-mcp` mode, start the MCP server in another terminal:

```bash
npm run mcp:playwright
```

#### Production Build

```bash
npm run build
npm start
```

## 🔐 Environment Variables

Create a `.env.local` file in the root directory with the following variables:

### Required Variables

```bash
# OpenAI API Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**How to get**: Sign up at [OpenAI Platform](https://platform.openai.com/) and create an API key.

### MCP Backend Configuration

Choose one or more MCP backends:

#### Option 1: Browserbase (Cloud Browser)

```bash
# Browserbase MCP Configuration
BROWSERBASE_API_KEY=your-browserbase-api-key-here
BROWSERBASE_PROJECT_ID=your-browserbase-project-id-here
```

**How to get**:
1. Sign up at [Browserbase](https://www.browserbase.com/)
2. Create a project in the dashboard
3. Copy your API key and Project ID

**Pros**: Reliable, scalable, no local browser setup
**Cons**: Requires external service, adds latency

#### Option 2: Playwright (Local Browser, Direct)

```bash
# Playwright (Direct) Configuration (Optional)
PLAYWRIGHT_HEADLESS=true
```

**Setup**:
1. Install Playwright browsers: `npx playwright install chromium`
2. No API key needed - runs locally

**Pros**: Fast, no external dependencies, free
**Cons**: Requires local resources, less reliable for production

#### Option 3: Playwright MCP (Local MCP Server)

```bash
# Playwright MCP Configuration
PLAYWRIGHT_MCP_URL=http://127.0.0.1:3001
PLAYWRIGHT_MCP_HOST=127.0.0.1
PLAYWRIGHT_MCP_PORT=3001
PLAYWRIGHT_MCP_BROWSER=chromium
PLAYWRIGHT_MCP_HEADLESS=true
PLAYWRIGHT_MCP_NO_SANDBOX=true
```

**Setup**:
1. Start the MCP server: `npm run mcp:playwright`
2. Keep the server running while using the app

**Pros**: Standard MCP transport, works with external MCP clients
**Cons**: Requires running an MCP server process

#### MCP Mode Selection

```bash
# Choose MCP mode: 'playwright' | 'playwright-mcp' | 'browserbase' | 'both'
MCP_MODE=playwright
```

- `playwright`: Use local Playwright only
- `playwright-mcp`: Use Playwright MCP server (HTTP/SSE)
- `browserbase`: Use Browserbase cloud only
- `both`: Run A/B evaluation with Browserbase + Playwright (direct)

### Optional Configuration Variables

```bash
# Retry Configuration
RETRY_INTERVAL_MS=5000          # Retry interval in milliseconds (default: 5000)
RETRY_MAX_ATTEMPTS=6            # Maximum retry attempts (default: 6)

# Rate Limiting
RATE_LIMIT_PER_MINUTE=10        # Requests per minute (default: 10)

# Scraping Configuration
COOLDOWN_SECONDS=30             # Cooldown after detection (default: 30)
DETAIL_PAGE_CONCURRENCY=3       # Concurrent detail page requests (default: 3)

# Chat Configuration
MAX_HISTORY_ROUNDS=10           # Conversation history rounds (default: 10)

# Playwright (Direct)
PLAYWRIGHT_HEADLESS=true        # Show browser window when false

# Playwright MCP
PLAYWRIGHT_MCP_URL=http://127.0.0.1:3001
PLAYWRIGHT_MCP_HOST=127.0.0.1
PLAYWRIGHT_MCP_PORT=3001
PLAYWRIGHT_MCP_BROWSER=chromium
PLAYWRIGHT_MCP_HEADLESS=true
PLAYWRIGHT_MCP_NO_SANDBOX=true

# Legacy/Shared
MCP_PORT=3001                   # Fallback port for Playwright MCP URL
MCP_BROWSER=chromium            # Browser type: chromium | firefox | webkit
```

## 💬 Usage Examples

### Basic Search

```
User: "Find me a place in Tokyo for next weekend"
Agent: "I need a few more details. What are the specific check-in and check-out dates?"
User: "January 25 to January 27"
Agent: [Searches and returns top 10 listings with reviews]
```

### Search with Budget

```
User: "Search Airbnb in Paris from March 1 to March 5, budget $200 per night"
Agent: [Searches within budget, returns filtered results]
```

### A/B Evaluation Mode

Set `MCP_MODE=both` in `.env.local` to compare Browserbase and Playwright results side-by-side.

## 🛠 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## ⚙️ Configuration Details

### Search Behavior

- **Default guests**: 2 (if not specified)
- **Max results**: 10 listings
- **No budget**: Returns 5 high-price + 5 mid-range, sorted high to low
- **With budget**: Filters within range, relaxes +15% if < 10 results
- **Review extraction**: 10+ reviews per listing (or all available)

### Anti-Scraping Measures

- Random delays: 1-2 seconds between requests
- Concurrency limit: 3 detail pages at a time
- Cooldown: 30 seconds after detection
- Retry logic: 5s interval, max 6 attempts

### Rate Limiting

- 10 requests per minute per user
- Configurable via `RATE_LIMIT_PER_MINUTE`

## 📊 Implementation Status

### ✅ Completed (Phases 1-4)

#### Phase 1: Foundation
- ✅ Next.js 16 with TypeScript setup
- ✅ Type definitions (chat, listing, mcp, eval)
- ✅ Error handling and structured logging
- ✅ UI components (Skeleton, Button, Card)
- ✅ Chat components (ChatContainer, MessageList, InputBar, ListingCard)
- ✅ SSE streaming infrastructure
- ✅ Design system with CSS variables

#### Phase 2: LLM Integration
- ✅ OpenAI GPT-4o integration
- ✅ Function calling schemas (collectSearchParams, searchAirbnb, summarizeListings)
- ✅ Slot filling and intent parsing
- ✅ Clarifying question generation
- ✅ Review summarization

#### Phase 3: MCP & Scraping
- ✅ MCP adapter interface
- ✅ Browserbase adapter implementation
- ✅ Playwright adapter implementation
- ✅ Playwright MCP adapter implementation
- ✅ Airbnb scraping with configurable selectors
- ✅ Detail page review extraction (10+ reviews)
- ✅ Retry and failover logic

#### Phase 4: Post-processing & Evaluation
- ✅ Result filtering and sorting
- ✅ Budget-based filtering with relaxation
- ✅ A/B evaluation harness
- ✅ Comparison view UI
- ✅ Structured logging for evaluation

#### Phase 5: Polish (In Progress)
- ✅ Loading states and skeleton UI
- ✅ Error handling with user-friendly messages
- ✅ Rate limiting (10 req/min)
- ⏳ Vercel deployment (pending)

### 🎯 Next Steps
- Deploy to Vercel
- Production testing and optimization
- Documentation updates

## 🔧 Troubleshooting

### Common Issues

#### "OpenAI API key not found"
- Ensure `OPENAI_API_KEY` is set in `.env.local`
- Restart the development server after adding environment variables

#### "MCP connection failed"
- **Browserbase**: Verify `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are correct
- **Playwright (Direct)**: Run `npx playwright install chromium` to install browsers
- **Playwright MCP**: Start the MCP server (`npm run mcp:playwright`)
- Check that the selected MCP mode matches your configuration

#### "Rate limit exceeded"
- Default limit is 10 requests per minute
- Adjust `RATE_LIMIT_PER_MINUTE` in `.env.local` if needed

#### "Scraping blocked / No results"
- Airbnb may have updated their UI - check `src/config/selectors.json`
- Increase cooldown time via `COOLDOWN_SECONDS`
- Try switching MCP backends (Browserbase vs Playwright vs Playwright MCP)

## 📚 Key Files Reference

### Core Configuration
- `src/config/constants.ts` - Application configuration and defaults
- `src/config/selectors.json` - Airbnb CSS selectors (update when UI changes)
- `.env.local` - Environment variables (not in git)

### API Endpoints
- `src/app/api/chat/route.ts` - Main SSE streaming endpoint

### MCP Adapters
- `src/lib/mcp/browserbase.ts` - Browserbase cloud browser adapter
- `src/lib/mcp/playwright.ts` - Playwright local browser adapter
- `src/lib/mcp/playwright-mcp.ts` - Playwright MCP adapter
- `src/lib/mcp/base.ts` - Base adapter with retry logic

### LLM Integration
- `src/lib/llm/planner.ts` - Slot filling and intent parsing
- `src/lib/llm/schemas.ts` - OpenAI function calling schemas
- `src/lib/llm/summarizer.ts` - Review summarization

### UI Components
- `src/components/Chat/ChatContainer.tsx` - Main chat interface
- `src/components/Chat/ListingCard.tsx` - Listing result display
- `src/components/Chat/ComparisonView.tsx` - A/B comparison UI

## 📖 Documentation

- **DESIGN.md** - Full product and architecture specification
- **CLAUDE.md** - Project guidelines for Claude Code
- **AGENTS.md** - Agent skills and trigger rules (if available)

## 🔗 Related Links

- [OpenAI Platform](https://platform.openai.com/) - Get your OpenAI API key
- [Browserbase](https://www.browserbase.com/) - Cloud browser automation
- [Playwright](https://playwright.dev/) - Local browser automation
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) - MCP server for Playwright
- [Next.js Documentation](https://nextjs.org/docs) - Next.js framework docs
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

## 📝 License

This project is for educational and demonstration purposes.

---

**Built with**: Next.js 16, TypeScript, OpenAI GPT-4o, MCP (Browserbase + Playwright + Playwright MCP)

**Last Updated**: 2026-01-18
