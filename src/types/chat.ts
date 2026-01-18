// Chat message types for the conversation interface

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCall {
  name: 'collectSearchParams' | 'searchAirbnb' | 'summarizeListings';
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    toolCalls?: ToolCall[];
    searchResults?: unknown[];
    mcpMode?: 'playwright' | 'browserbase' | 'both';
  };
}

export interface ConversationHistory {
  messages: ChatMessage[];
  maxRounds: number; // 10 rounds
}
