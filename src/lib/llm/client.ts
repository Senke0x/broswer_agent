// Shared OpenAI client configuration

import OpenAI from 'openai';

/**
 * Lazy-initialized OpenAI client instance
 * Creates the client only when first accessed (at runtime)
 */
let _openai: OpenAI | null = null;
let _validationPromise: Promise<void> | null = null;

interface OpenAIClientConfig {
  apiKey: string;
  baseURL?: string;
}

function resolveOpenAIConfig(): OpenAIClientConfig {
  const proxyUrl = process.env.OPENAI_PROXY_URL || process.env.OPENAI_BASE_URL;
  const proxyKey = process.env.OPENAI_PROXY_API_KEY;
  const apiKey = proxyUrl ? (proxyKey || process.env.OPENAI_API_KEY || '') : (process.env.OPENAI_API_KEY || '');

  return {
    apiKey,
    baseURL: proxyUrl || undefined,
  };
}

function createOpenAIClient(): OpenAI {
  const { apiKey, baseURL } = resolveOpenAIConfig();

  // Debug logging (always log for troubleshooting)
  console.log('[OpenAI Client Config]', {
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'missing',
    baseURL: baseURL || 'default (api.openai.com)',
    envProxyUrl: process.env.OPENAI_PROXY_URL || 'not set',
    envBaseUrl: process.env.OPENAI_BASE_URL || 'not set',
    envProxyKey: process.env.OPENAI_PROXY_API_KEY ? 'set' : 'not set',
    envApiKey: process.env.OPENAI_API_KEY ? 'set' : 'not set',
  });

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = createOpenAIClient();
  }
  return _openai;
}

/**
 * Validate API key and ensure the default model is accessible.
 * This checks both key validity and model availability (gpt-4o).
 * Uses chat.completions.create instead of models.retrieve for better proxy compatibility.
 */
export async function ensureOpenAIReady(): Promise<void> {
  if (_validationPromise) {
    return _validationPromise;
  }

  _validationPromise = (async () => {
    const { apiKey } = resolveOpenAIConfig();
    if (!apiKey) {
      throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY or OPENAI_PROXY_API_KEY.');
    }

    const openai = getOpenAIClient();
    // Use chat.completions.create for validation instead of models.retrieve
    // This is more compatible with third-party proxies and tests the actual endpoint we use
    await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    });
  })();

  try {
    await _validationPromise;
  } catch (error) {
    _validationPromise = null;
    throw error;
  }
}

/**
 * Get list of available models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const openai = getOpenAIClient();
    const modelsResponse = await openai.models.list();
    return modelsResponse.data
      .map(model => model.id)
      .filter(id => id.startsWith('gpt-') || id.startsWith('o1-'))
      .sort();
  } catch (error) {
    // If models.list() fails, return default list
    console.warn('Failed to fetch models list, using defaults:', error);
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
    ];
  }
}

/**
 * Default model for chat completions
 */
export const DEFAULT_MODEL = 'gpt-4o';

/**
 * Default temperature for creative tasks
 */
export const DEFAULT_TEMPERATURE = 0.7;
