// Shared OpenAI client configuration

import OpenAI from 'openai';

/**
 * Lazy-initialized OpenAI client instance
 * Creates the client only when first accessed (at runtime)
 */
let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

/**
 * Default model for chat completions
 */
export const DEFAULT_MODEL = 'gpt-4o';

/**
 * Default temperature for creative tasks
 */
export const DEFAULT_TEMPERATURE = 0.7;
