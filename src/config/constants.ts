// Application configuration constants

export const APP_CONFIG = {
  // Retry configuration
  retry: {
    intervalMs: parseInt(process.env.RETRY_INTERVAL_MS || '5000'), // 5s
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '6'), // 6 times
  },

  // Rate limiting
  rateLimit: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10'), // 10 req/min
  },

  // Anti-detection and scraping
  scraping: {
    cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS || '30'), // 30s
    detailPageConcurrency: parseInt(process.env.DETAIL_PAGE_CONCURRENCY || '3'), // 3 concurrent
    minDelayMs: 1000, // 1s min delay
    maxDelayMs: 2000, // 2s max delay
  },

  // Conversation management
  chat: {
    maxHistoryRounds: parseInt(process.env.MAX_HISTORY_ROUNDS || '10'), // 10 rounds
    maxTokens: 4000,
  },

  // Search results configuration
  search: {
    defaultGuests: 2,
    maxResults: 10,
    highPriceCount: 5,
    midPriceCount: 5,
    budgetRelaxPercent: 15, // +15% if < 10 results
    minReviewsForSummary: 10,
  },

  // MCP configuration
  mcp: {
    timeout: 30000, // 30s
    defaultMode: (process.env.MCP_MODE || 'playwright') as 'playwright' | 'browserbase' | 'both',
    playwright: {
      port: parseInt(process.env.MCP_PORT || '3001'),
      browser: (process.env.MCP_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit',
      headless: true,
    },
    browserbase: {
      apiKey: process.env.BROWSERBASE_API_KEY || '',
      projectId: process.env.BROWSERBASE_PROJECT_ID || '',
    },
  },

  // LLM configuration
  llm: {
    model: 'gpt-4o', // GPT-4o for all tasks
    apiKey: process.env.OPENAI_API_KEY || '',
    maxTokens: 2000,
    temperature: 0.7,
  },
} as const;
