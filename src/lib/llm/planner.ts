// LLM Planner for slot filling and intent parsing

import { ChatMessage, ToolCall } from '@/types/chat';
import { SearchParams } from '@/types/listing';
import { collectSearchParamsSchema, searchAirbnbSchema } from './schemas';
import { getOpenAIClient, DEFAULT_MODEL, ensureOpenAIReady } from './client';
import OpenAI from 'openai';

/**
 * Result of planning operation
 */
export interface PlanResult {
  action: 'ask_clarification' | 'execute_search' | 'error';
  message?: string;
  searchParams?: Partial<SearchParams>;
  missingFields?: string[];
  toolCall?: ToolCall;
}

type SearchParamsPayload = Partial<SearchParams> & {
  missingFields?: string[];
  clarificationNeeded?: string | null;
};

/**
 * Build system prompt with current time context for relative date inference
 */
function buildSystemPrompt(userTime?: string, userTimezone?: string): string {
  // Parse user time or fallback to server time
  const now = userTime ? new Date(userTime) : new Date();
  const timezone = userTimezone || 'UTC';

  // Get day of week name
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[now.getDay()];

  // Format date components
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return `You are an Airbnb search assistant. Your job is to help users find Airbnb listings by:
1. Extracting search parameters (location, check-in, check-out dates, guests, budget)
2. Asking clarifying questions for missing required information
3. Converting relative dates (e.g., "next weekend", "this Friday") to explicit dates

CURRENT TIME CONTEXT:
- Current date: ${dateStr} (${dayOfWeek})
- User timezone: ${timezone}
- Year: ${year}

RELATIVE DATE CONVERSION RULES:
- "this weekend" = the upcoming Saturday and Sunday of the current week
- "next weekend" = Saturday and Sunday of next week
- "this Friday" = the upcoming Friday (or today if it's Friday)
- "next Monday" = Monday of next week
- "tomorrow" = the day after today
- "in X days" = today + X days
- Holiday dates (e.g., "Christmas", "New Year") = infer the actual date based on current year

Required fields: location, checkIn (YYYY-MM-DD), checkOut (YYYY-MM-DD)
Optional fields: guests (default: 2), budgetMin, budgetMax, currency (default: USD)

IMPORTANT:
- Use the current date context above to calculate exact dates from relative expressions
- When user mentions relative dates, convert them to explicit YYYY-MM-DD format
- If the inferred date seems ambiguous, confirm with the user
- Check-in date must be in the future (after ${dateStr})
- Check-out date must be after check-in date
- Be conversational and helpful`;
}

/**
 * Options for planNextAction
 */
export interface PlanOptions {
  model?: string;
  userTime?: string;       // ISO 8601 timestamp from user's browser
  userTimezone?: string;   // IANA timezone string (e.g., 'Asia/Shanghai')
}

/**
 * Plan the next action based on user message and conversation history
 */
export async function planNextAction(
  userMessage: string,
  history: ChatMessage[],
  options?: PlanOptions
): Promise<PlanResult> {
  try {
    const { model, userTime, userTimezone } = options || {};

    // Build conversation context for OpenAI with time-aware system prompt
    const systemPrompt = buildSystemPrompt(userTime, userTimezone);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    // Call OpenAI with function calling
    await ensureOpenAIReady();
    const openai = getOpenAIClient();
    const selectedModel = model || DEFAULT_MODEL;

    // Debug logging (always log for troubleshooting)
    console.log('[LLM Planner] Calling chat.completions.create', {
      model: selectedModel,
      messagesCount: messages.length,
      hasTools: true,
    });

    try {
      const response = await openai.chat.completions.create({
        model: selectedModel,
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
          const args = parseSearchParamsPayload(toolCall.function.arguments);

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
    } catch (apiError: unknown) {
      // Enhanced error logging
      console.error('[LLM Planner] API call failed', {
        model: selectedModel,
        error: apiError instanceof Error ? apiError.message : String(apiError),
        errorType: apiError instanceof Error ? apiError.constructor.name : typeof apiError,
        ...(apiError && typeof apiError === 'object' && 'status' in apiError ? { status: apiError.status } : {}),
        ...(apiError && typeof apiError === 'object' && 'requestID' in apiError ? { requestID: apiError.requestID } : {}),
      });
      throw apiError;
    }

  } catch (error) {
    console.error('LLM planner error:', error);

    // Enhanced error logging for debugging
    if (error instanceof Error) {
      const errorDetails: Record<string, unknown> = {
        message: error.message,
        name: error.name,
      };

      // Extract additional info from OpenAI errors
      if ('status' in error) {
        errorDetails.status = error.status;
      }
      if ('code' in error) {
        errorDetails.code = error.code;
      }
      if ('requestID' in error) {
        errorDetails.requestID = error.requestID;
      }

      console.error('LLM planner error details:', errorDetails);
    }

    return {
      action: 'error',
      message: 'Sorry, I encountered an error processing your request.'
    };
  }
}

/**
 * Handle collectSearchParams function call
 */
function handleCollectSearchParams(args: SearchParamsPayload): PlanResult {
  const { clarificationNeeded, missingFields, ...params } = args;
  const toolCall: ToolCall = {
    name: 'collectSearchParams',
    arguments: args as Record<string, unknown>
  };

  // If there's a clarification question, ask it
  if (clarificationNeeded) {
    return {
      action: 'ask_clarification',
      message: clarificationNeeded,
      searchParams: params,
      missingFields: missingFields || [],
      toolCall
    };
  }

  // Check if all required fields are present
  const required = ['location', 'checkIn', 'checkOut'];
  const missing = required.filter(field => !params[field as keyof SearchParams]);

  if (missing.length > 0) {
    return {
      action: 'ask_clarification',
      message: `I need more information: ${missing.join(', ')}`,
      searchParams: params,
      missingFields: missing,
      toolCall
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
    },
    toolCall
  };
}

/**
 * Handle searchAirbnb function call
 */
function handleSearchAirbnb(args: SearchParamsPayload): PlanResult {
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
    },
    toolCall: {
      name: 'searchAirbnb',
      arguments: args as Record<string, unknown>
    }
  };
}

function parseSearchParamsPayload(raw: string): SearchParamsPayload {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as SearchParamsPayload;
    }
  } catch (error) {
    console.error('Failed to parse tool call arguments', error);
  }
  return {};
}
