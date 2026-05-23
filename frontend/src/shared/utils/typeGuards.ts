/**
 * Type guard utilities for safe error handling and type narrowing.
 */

export interface AxiosErrorShape {
  response?: {
    data?: {
      detail?: string;
      message?: string;
      [key: string]: unknown;
    };
  };
  message?: string;
}

/**
 * Check if an unknown error is shaped like an Axios error.
 */
export function isAxiosError(error: unknown): error is AxiosErrorShape {
  return typeof error === 'object' && error !== null && 'response' in error;
}

/**
 * Safely extract an error message from any error shape.
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (isAxiosError(error)) {
    return error.response?.data?.detail 
      ?? error.response?.data?.message 
      ?? error.message 
      ?? fallback;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    return String((error as Record<string, unknown>).message) || fallback;
  }
  return fallback;
}

/**
 * Assert that a condition is true, otherwise throw.
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Type-safe way to parse JSON with a fallback.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}