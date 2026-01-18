// OpenAI function calling schemas for LLM planner

import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Schema for collecting search parameters from user input
 * Used for slot filling and clarification
 */
export const collectSearchParamsSchema: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'collectSearchParams',
    description: 'Extract and validate search parameters from user input. Ask clarifying questions for missing required fields.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City or region name (e.g., "Tokyo", "Paris", "New York")'
        },
        checkIn: {
          type: 'string',
          description: 'Check-in date in ISO format YYYY-MM-DD. Must be explicit date, not relative.'
        },
        checkOut: {
          type: 'string',
          description: 'Check-out date in ISO format YYYY-MM-DD. Must be explicit date, not relative.'
        },
        guests: {
          type: 'number',
          description: 'Number of guests (default: 2)',
          default: 2
        },
        budgetMin: {
          type: 'number',
          description: 'Minimum budget per night in local currency (optional)',
          nullable: true
        },
        budgetMax: {
          type: 'number',
          description: 'Maximum budget per night in local currency (optional)',
          nullable: true
        },
        currency: {
          type: 'string',
          description: 'Currency code (ISO 4217, e.g., USD, EUR, JPY)',
          default: 'USD'
        },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of required fields that are still missing'
        },
        clarificationNeeded: {
          type: 'string',
          description: 'Question to ask user for missing or ambiguous information',
          nullable: true
        }
      },
      required: ['location']
    }
  }
};

/**
 * Schema for executing Airbnb search
 * Called when all required parameters are collected
 */
export const searchAirbnbSchema: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'searchAirbnb',
    description: 'Execute Airbnb search with validated parameters. Returns top 10 listings.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City or region name'
        },
        checkIn: {
          type: 'string',
          description: 'Check-in date (ISO format YYYY-MM-DD)'
        },
        checkOut: {
          type: 'string',
          description: 'Check-out date (ISO format YYYY-MM-DD)'
        },
        guests: {
          type: 'number',
          description: 'Number of guests',
          default: 2
        },
        budgetMin: {
          type: 'number',
          description: 'Minimum budget per night',
          nullable: true
        },
        budgetMax: {
          type: 'number',
          description: 'Maximum budget per night',
          nullable: true
        },
        currency: {
          type: 'string',
          description: 'Currency code (ISO 4217)',
          default: 'USD'
        },
        mcpMode: {
          type: 'string',
          enum: ['playwright', 'browserbase', 'both'],
          description: 'MCP backend to use for search',
          default: 'playwright'
        }
      },
      required: ['location', 'checkIn', 'checkOut']
    }
  }
};

/**
 * Schema for summarizing listings
 * Used to generate user-friendly summaries of search results
 */
export const summarizeListingsSchema: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'summarizeListings',
    description: 'Generate a natural language summary of search results for the user.',
    parameters: {
      type: 'object',
      properties: {
        listings: {
          type: 'array',
          description: 'Array of listing objects to summarize',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              pricePerNight: { type: 'number' },
              currency: { type: 'string' },
              rating: { type: 'number', nullable: true },
              reviewCount: { type: 'number', nullable: true },
              url: { type: 'string' }
            }
          }
        },
        searchContext: {
          type: 'object',
          description: 'Context about the search query',
          properties: {
            location: { type: 'string' },
            checkIn: { type: 'string' },
            checkOut: { type: 'string' },
            hadBudget: { type: 'boolean' },
            budgetRelaxed: { type: 'boolean' }
          }
        }
      },
      required: ['listings', 'searchContext']
    }
  }
};

/**
 * All available function schemas
 */
export const allSchemas = [
  collectSearchParamsSchema,
  searchAirbnbSchema,
  summarizeListingsSchema
];

