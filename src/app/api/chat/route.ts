import { NextRequest } from 'next/server';
import { SSEEncoder } from '@/lib/chat/sse-encoder';
import { planNextAction } from '@/lib/llm/planner';
import { ChatMessage } from '@/types/chat';

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

  // Parse conversation history
  let history: ChatMessage[] = [];
  try {
    history = historyStr ? JSON.parse(historyStr) : [];
  } catch (error) {
    console.error('Failed to parse history:', error);
    // Continue with empty history if parsing fails
  }

  // Create SSE encoder
  const encoder = new SSEEncoder();

  // Create async generator for streaming response
  async function* generateResponse(): AsyncGenerator<string> {
    try {
      // Call LLM planner to determine next action
      const planResult = await planNextAction(userMessage, history);

      if (planResult.action === 'ask_clarification') {
        // Stream clarification question to user
        const message = planResult.message || 'Could you provide more details?';
        yield message;
      } else if (planResult.action === 'execute_search') {
        // TODO: Phase 3 - Execute MCP search
        // For now, show what parameters were collected
        yield 'Great! I have all the information I need:\n\n';

        const params = planResult.searchParams;
        if (params) {
          yield `📍 Location: ${params.location}\n`;
          yield `📅 Check-in: ${params.checkIn}\n`;
          yield `📅 Check-out: ${params.checkOut}\n`;
          yield `👥 Guests: ${params.guests || 2}\n`;

          if (params.budgetMax) {
            yield `💰 Budget: ${params.budgetMin || 0} - ${params.budgetMax} ${params.currency || 'USD'}\n`;
          }

          yield '\n🔍 Search functionality will be implemented in Phase 3 (MCP Integration).\n';
        }
      } else if (planResult.action === 'error') {
        yield planResult.message || 'Sorry, I encountered an error processing your request.';
      }
    } catch (error) {
      console.error('Error in generateResponse:', error);
      yield 'Sorry, I encountered an error processing your request. Please try again.';
    }
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
