import { offlineQueue, OfflineActionType } from './offlineQueue';

interface OfflineSubmitResult<T> {
  success: boolean;
  queued: boolean;
  data?: T;
  error?: Error;
}

/**
 * Wraps an async submission with offline support.
 * If offline, queues the action for later sync.
 * If online but network fails, also queues.
 */
export async function submitWithOfflineSupport<T>(
  type: OfflineActionType,
  submitFn: () => Promise<T>,
  queueData: Record<string, unknown>
): Promise<OfflineSubmitResult<T>> {
  // Check if we're offline
  if (!navigator.onLine) {
    await offlineQueue.add(type, queueData);
    return { success: true, queued: true };
  }

  try {
    const data = await submitFn();
    return { success: true, queued: false, data };
  } catch (error: any) {
    // Check if it's a network error
    const isNetworkError = 
      error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('fetch') ||
      error.message?.toLowerCase().includes('failed to fetch') ||
      error.name === 'TypeError';

    if (isNetworkError) {
      // Queue for later sync
      await offlineQueue.add(type, queueData);
      return { success: true, queued: true };
    }

    // Re-throw non-network errors
    return { success: false, queued: false, error };
  }
}
