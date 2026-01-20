import { supabase } from "@/integrations/supabase/client";

export interface DeepgramValidationResult {
  valid: boolean;
  error?: string;
  message: string;
  statusCode?: number;
  projectCount?: number;
}

/**
 * Validates the Deepgram API key by making a test request
 * @returns Promise with validation result
 */
export async function validateDeepgramApiKey(): Promise<DeepgramValidationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('validate-deepgram-key', {
      method: 'POST',
    });

    if (error) {
      console.error('Failed to invoke validation function:', error);
      return {
        valid: false,
        error: 'FUNCTION_ERROR',
        message: `Failed to validate API key: ${error.message}`,
      };
    }

    return data as DeepgramValidationResult;
  } catch (error) {
    console.error('Error validating Deepgram API key:', error);
    return {
      valid: false,
      error: 'NETWORK_ERROR',
      message: `Network error during validation: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get user-friendly error messages for different validation failures
 */
export function getValidationErrorMessage(result: DeepgramValidationResult): string {
  if (result.valid) {
    return result.message;
  }

  switch (result.error) {
    case 'NO_API_KEY':
      return '⚠️ Deepgram API key is not configured. Please add DEEPGRAM_API_KEY to your edge function secrets.';
    case 'INVALID_API_KEY':
      return '❌ Invalid Deepgram API key. Please verify your API key at console.deepgram.com';
    case 'BILLING_REQUIRED':
      return '💳 Deepgram billing required. Please set up billing at console.deepgram.com to use the streaming API.';
    case 'INSUFFICIENT_PERMISSIONS':
      return '🔒 API key has insufficient permissions. Create a new key with full access at console.deepgram.com';
    case 'FUNCTION_ERROR':
    case 'NETWORK_ERROR':
    case 'VALIDATION_ERROR':
    default:
      return `⚠️ ${result.message}`;
  }
}
