// Error types and codes for the application

export enum ErrorCode {
  // MCP errors
  MCP_CONNECTION_FAILED = 'MCP_001',
  MCP_TIMEOUT = 'MCP_002',
  MCP_EXECUTION_FAILED = 'MCP_003',

  // Scraping errors
  SCRAPING_BLOCKED = 'SCRAPE_001',
  SCRAPING_TIMEOUT = 'SCRAPE_002',
  SCRAPING_PARSE_ERROR = 'SCRAPE_003',

  // Rate limiting
  RATE_LIMITED = 'RATE_001',

  // Parameter validation
  INVALID_PARAMS = 'PARAM_001',
  MISSING_REQUIRED_FIELD = 'PARAM_002',

  // LLM errors
  LLM_ERROR = 'LLM_001',
  LLM_TIMEOUT = 'LLM_002',
  LLM_INVALID_RESPONSE = 'LLM_003',

  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_001',
  NETWORK_ERROR = 'NETWORK_001',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string; // User-friendly message
  retryable: boolean;
  details?: unknown;
  timestamp?: string;
}

export class ApplicationError extends Error implements AppError {
  code: ErrorCode;
  userMessage: string;
  retryable: boolean;
  details?: unknown;
  timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    userMessage: string,
    retryable: boolean = false,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}
