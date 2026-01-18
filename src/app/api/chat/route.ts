import { NextRequest } from 'next/server';
import { SSEEncoder } from '@/lib/chat/sse-encoder';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const message = searchParams.get('message');
  const historyStr = searchParams.get('history');

  if (!message) {
    return new Response('Message is required', { status: 400 });
  }

  // Store message as non-null string for use in generator
  const userMessage: string = message;

  // TODO: Phase 2 - Parse and use history for context
  // const history = historyStr ? JSON.parse(historyStr) : [];

  // Create SSE encoder
  const encoder = new SSEEncoder();

  // Create async generator for streaming response
  async function* generateResponse(): AsyncGenerator<string> {
    // TODO: Phase 2 - Integrate with OpenAI LLM
    // For now, return a placeholder response

    yield 'I received your message: "';
    yield userMessage;
    yield '". ';

    yield '\n\nThis is a placeholder response. ';
    yield 'In Phase 2, I will integrate with OpenAI to:\n';
    yield '1. Parse your search intent\n';
    yield '2. Extract location, dates, and preferences\n';
    yield '3. Execute Airbnb search via MCP\n';
    yield '4. Return formatted results\n';
  }

  // Create and return SSE stream
  const stream = encoder.createStream(generateResponse());

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
