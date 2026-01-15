/**
 * Retry with Exponential Backoff Utility
 * 
 * Provides a generic retry mechanism for async operations with configurable
 * exponential backoff, jitter, and callbacks.
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Callback when a retry is about to happen */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Executes an async function with retry logic and exponential backoff.
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function if successful
 * @throws The last error if all retries fail
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   {
 *     maxAttempts: 3,
 *     baseDelayMs: 1000,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    jitter = true,
    onRetry,
    isRetryable = () => true,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        console.log(`❌ Error not retryable: ${lastError.message}`);
        break;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      // Add jitter (±25% of delay)
      if (jitter) {
        const jitterAmount = delay * 0.25;
        delay = delay + (Math.random() * 2 - 1) * jitterAmount;
      }

      delay = Math.round(delay);

      // Call onRetry callback
      onRetry?.(attempt, lastError, delay);

      console.log(
        `🔄 Retry ${attempt}/${maxAttempts - 1}: ${lastError.message}. Waiting ${delay}ms...`
      );

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Creates a retryable version of an async function.
 * Useful for wrapping functions that should always use retry logic.
 * 
 * @param fn - The async function to wrap
 * @param options - Default retry options
 * @returns A wrapped function that retries on failure
 * 
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(fetchData, { maxAttempts: 3 });
 * const result = await fetchWithRetry();
 * ```
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) =>
    retryWithBackoff(() => fn(...args), options)) as T;
}

/**
 * Determines if an error is likely transient and worth retrying.
 * Useful for network errors, rate limits, and temporary failures.
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('network') || message.includes('fetch')) {
    return true;
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }
  
  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }
  
  // Server errors (5xx)
  if (message.includes('500') || message.includes('502') || 
      message.includes('503') || message.includes('504')) {
    return true;
  }
  
  // Temporary unavailable
  if (message.includes('temporarily') || message.includes('unavailable')) {
    return true;
  }
  
  return false;
}
