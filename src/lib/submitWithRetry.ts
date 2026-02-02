import { supabase } from '@/integrations/supabase/client';

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

interface SubmissionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount?: number;
  alreadySubmitted?: boolean;
}

/**
 * Submit to an edge function with exponential backoff retry.
 * Designed for high-concurrency classroom scenarios (20+ students).
 */
export async function submitWithRetry<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: RetryOptions = {}
): Promise<SubmissionResult<T>> {
  const {
    maxRetries = 3,
    baseDelayMs = 200,
    maxDelayMs = 2000,
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
      });

      if (error) {
        // Check for duplicate submission (already answered)
        if (error.message?.includes('already') || error.message?.includes('duplicate')) {
          return {
            success: true,
            alreadySubmitted: true,
            retryCount: attempt,
          };
        }
        
        // Network/transient errors - retry
        if (
          error.message?.toLowerCase().includes('network') ||
          error.message?.toLowerCase().includes('fetch') ||
          error.message?.toLowerCase().includes('timeout') ||
          error.message?.toLowerCase().includes('connection')
        ) {
          lastError = new Error(error.message);
          
          if (attempt < maxRetries) {
            // Exponential backoff with jitter
            const delay = Math.min(
              baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
              maxDelayMs
            );
            console.log(`⏳ Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw lastError;
        }
        
        // Non-retryable error
        throw new Error(error.message);
      }

      return {
        success: true,
        data: data as T,
        retryCount: attempt,
        alreadySubmitted: (data as any)?.alreadySubmitted || false,
      };
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a network error worth retrying
      const isRetryable = 
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('fetch') ||
        error.message?.toLowerCase().includes('failed to fetch') ||
        error.name === 'TypeError';
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
          maxDelayMs
        );
        console.log(`⏳ Network retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  return {
    success: false,
    error: lastError || new Error('Unknown error'),
    retryCount: maxRetries,
  };
}

/**
 * Submit a live session response with retry logic.
 * Optimized for classroom settings with 20+ concurrent students.
 */
export async function submitLiveResponseWithRetry(
  questionId: string,
  participantId: string,
  answer: string,
  responseTimeMs: number,
  confidenceLevel?: string | null,
  confidenceMultiplier?: number
): Promise<SubmissionResult<{
  isCorrect: boolean;
  pointsEarned: number;
  confidenceMultiplier: number;
  correctAnswer: string;
  alreadySubmitted?: boolean;
}>> {
  return submitWithRetry('submit-live-response', {
    questionId,
    participantId,
    answer,
    responseTimeMs,
    confidenceLevel,
    confidenceMultiplier: confidenceMultiplier || 1,
  });
}
