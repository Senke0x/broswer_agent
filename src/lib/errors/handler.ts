// Error handling utilities

import { ApplicationError, ErrorCode } from './types';

export function createError(
  code: ErrorCode,
  message: string,
  userMessage: string,
  retryable: boolean = false,
  details?: unknown
): ApplicationError {
  return new ApplicationError(code, message, userMessage, retryable, details);
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApplicationError) {
    return error.retryable;
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApplicationError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (error instanceof ApplicationError) {
    console.error('[AppError]', {
      code: error.code,
      message: error.message,
      userMessage: error.userMessage,
      retryable: error.retryable,
      timestamp: error.timestamp,
      details: error.details,
      context,
    });
  } else if (error instanceof Error) {
    console.error('[Error]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });
  } else {
    console.error('[Unknown Error]', { error, context });
  }
}
