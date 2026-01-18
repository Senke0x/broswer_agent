import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/llm/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

/**
 * GET /api/models
 * Fetch available models from OpenAI API
 */
export async function GET() {
  try {
    const openai = getOpenAIClient();

    // Try to list models, fallback to chat completion test if models endpoint is not available
    let models: string[] = [];

    try {
      const modelsResponse = await openai.models.list();
      models = modelsResponse.data
        .map(model => model.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o1-'))
        .sort();
    } catch (error) {
      // If models.list() fails (e.g., proxy doesn't support it),
      // we'll return a default list and let the user test models manually
      logger.warn('api', 'models.list() not available, using default list', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return common models that are likely available
      models = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'o1-preview',
        'o1-mini',
      ];
    }

    return NextResponse.json({ models }, { status: 200 });
  } catch (error) {
    logger.error('api', 'Failed to fetch models', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch models',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
