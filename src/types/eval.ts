// A/B evaluation types for comparing MCP backends

import { SearchParams, Listing } from './listing';

export interface MCPExecutionResult {
  listings: Listing[];
  timeToFirstResult: number; // ms
  totalTime: number; // ms
  errors: string[];
}

export interface EvalResult {
  sessionId: string;
  timestamp: string;
  searchParams: SearchParams;
  results: {
    playwright?: MCPExecutionResult;
    browserbase?: MCPExecutionResult;
  };
  comparison: {
    winner: 'playwright' | 'browserbase' | 'tie';
    completenessScore: { playwright: number; browserbase: number };
    accuracyScore: { playwright: number; browserbase: number };
    speedScore: { playwright: number; browserbase: number };
  };
}

export interface EvalMetrics {
  completeness: number; // 0-100, based on result count >= 10
  accuracy: number; // 0-100, based on fields present
  speed: number; // 0-100, based on total time
}
