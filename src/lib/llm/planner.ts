// LLM Planner for slot filling and intent parsing

import { ChatMessage } from '@/types/chat';
import { SearchParams } from '@/types/listing';
import { collectSearchParamsSchema, searchAirbnbSchema } from './schemas';
import { getOpenAIClient, DEFAULT_MODEL } from './client';
import OpenAI from 'openai';

/**
 * Result of planning operation
 */
export interface PlanResult {
  action: 'ask_clarification' | 'execute_search' | 'error';
  message?: string;
  searchParams?: Partial<SearchParams>;
  missingFields?: string[];
}

/**
 * System prompt for the LLM planner
 */
const SYSTEM_PROMPT = `You are an Airbnb search assistant. Your job is to help users find Airbnb listings by:
1. Extracting search parameters (location, check-in, check-out dates, guests, budget)
2. Asking clarifying questions for missing required information
3. Converting relative dates (e.g., "next weekend") to explicit dates and confirming with user

Required fields: location, checkIn (YYYY-MM-DD), checkOut (YYYY-MM-DD)
Optional fields: guests (default: 2), budgetMin, budgetMax, currency (default: USD)

IMPORTANT:
- Always convert relative dates to explicit dates and ask for confirmation
- Check-in date must be in the future
- Check-out date must be after check-in date
- Be conversational and helpful`;

/**
 * Plan the next action based on user message and conversation history
 */
export async function planNextAction(
  userMessage: string,
  history: ChatMessage[]
): Promise<PlanResult> {
  try {
    // Build conversation context for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    // Call OpenAI with function calling
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      tools: [collectSearchParamsSchema, searchAirbnbSchema],
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const choice = response.choices[0];

    // Check if LLM wants to call a function
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];

      // Type guard: check if it's a function tool call
      if (toolCall.type === 'function') {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (functionName === 'collectSearchParams') {
          return handleCollectSearchParams(args);
        } else if (functionName === 'searchAirbnb') {
          return handleSearchAirbnb(args);
        }
      }
    }

    // If no function call, return the assistant's message
    return {
      action: 'ask_clarification',
      message: choice.message.content || 'I need more information to help you search.'
    };

  } catch (error) {
    console.error('LLM planner error:', error);
    return {
      action: 'error',
      message: 'Sorry, I encountered an error processing your request.'
    };
  }
}

/**
 * Handle collectSearchParams function call
 */
function handleCollectSearchParams(args: any): PlanResult {
  const { clarificationNeeded, missingFields, ...params } = args;

  // If there's a clarification question, ask it
  if (clarificationNeeded) {
    return {
      action: 'ask_clarification',
      message: clarificationNeeded,
      searchParams: params,
      missingFields: missingFields || []
    };
  }

  // Check if all required fields are present
  const required = ['location', 'checkIn', 'checkOut'];
  const missing = required.filter(field => !params[field]);

  if (missing.length > 0) {
    return {
      action: 'ask_clarification',
      message: `I need more information: ${missing.join(', ')}`,
      searchParams: params,
      missingFields: missing
    };
  }

  // All required fields present, ready to search
  return {
    action: 'execute_search',
    searchParams: {
      location: params.location,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      guests: params.guests || 2,
      budgetMin: params.budgetMin,
      budgetMax: params.budgetMax,
      currency: params.currency || 'USD'
    }
  };
}

/**
 * Handle searchAirbnb function call
 */
function handleSearchAirbnb(args: any): PlanResult {
  return {
    action: 'execute_search',
    searchParams: {
      location: args.location,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guests: args.guests || 2,
      budgetMin: args.budgetMin,
      budgetMax: args.budgetMax,
      currency: args.currency || 'USD'
    }
  };
}


