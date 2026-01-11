/**
 * Reliable Timer Utility
 * 
 * Uses Web Workers to maintain accurate timing even when the browser tab is backgrounded.
 * Falls back to timestamp-based recovery if Workers are unavailable.
 */

// Web Worker code as a blob URL - runs independently of main thread throttling
const workerCode = `
  let timerId = null;
  let startTime = 0;
  let intervalMs = 0;
  let lastTickTime = 0;
  
  self.onmessage = (e) => {
    const { type, interval } = e.data;
    
    if (type === 'start') {
      intervalMs = interval;
      startTime = Date.now();
      lastTickTime = startTime;
      
      // Clear any existing timer
      if (timerId) clearInterval(timerId);
      
      // Tick every second for countdown updates
      timerId = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Send tick for UI updates
        self.postMessage({ type: 'tick', elapsed, startTime, intervalMs });
        
        // Check if interval is complete
        if (elapsed >= intervalMs) {
          self.postMessage({ type: 'interval_complete', elapsed });
          // Reset for next interval
          startTime = Date.now();
        }
        
        lastTickTime = now;
      }, 1000);
      
      // Confirm start
      self.postMessage({ type: 'started', intervalMs, startTime });
    }
    
    if (type === 'stop') {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      self.postMessage({ type: 'stopped' });
    }
    
    if (type === 'reset') {
      startTime = Date.now();
      self.postMessage({ type: 'reset_complete', startTime });
    }
    
    if (type === 'get_status') {
      const now = Date.now();
      const elapsed = now - startTime;
      self.postMessage({ 
        type: 'status', 
        running: timerId !== null, 
        elapsed, 
        intervalMs,
        startTime 
      });
    }
  };
`;

export interface ReliableTimerCallbacks {
  onTick: (secondsLeft: number, elapsedMs: number) => void;
  onIntervalComplete: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface ReliableTimer {
  start: (intervalMinutes: number) => void;
  stop: () => void;
  reset: () => void;
  terminate: () => void;
  isRunning: () => boolean;
}

/**
 * Creates a reliable timer that works even when the browser tab is backgrounded.
 * Uses Web Workers for accurate timing, with fallback for environments without Worker support.
 */
export function createReliableTimer(callbacks: ReliableTimerCallbacks): ReliableTimer {
  const { onTick, onIntervalComplete, onError } = callbacks;
  
  let worker: Worker | null = null;
  let running = false;
  let currentIntervalMs = 0;
  let fallbackTimerId: NodeJS.Timeout | null = null;
  let fallbackStartTime = 0;
  let usesFallback = false;
  
  // Try to create Web Worker
  const initWorker = (): boolean => {
    try {
      if (typeof Worker === 'undefined') {
        console.warn('⚠️ Web Workers not supported, using fallback timer');
        return false;
      }
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      
      worker.onmessage = (e) => {
        const { type, elapsed, intervalMs } = e.data;
        
        if (type === 'tick') {
          const secondsLeft = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
          onTick(secondsLeft, elapsed);
        }
        
        if (type === 'interval_complete') {
          console.log('⏰ Worker: Interval complete, triggering callback');
          Promise.resolve(onIntervalComplete()).catch((error) => {
            console.error('Error in onIntervalComplete:', error);
            onError?.(error);
          });
        }
        
        if (type === 'started') {
          console.log(`✅ Worker timer started: ${intervalMs / 1000 / 60} minutes`);
        }
      };
      
      worker.onerror = (error) => {
        console.error('Worker error:', error);
        onError?.(new Error('Timer worker error'));
        // Fall back to standard timer
        if (!usesFallback && running) {
          console.log('🔄 Falling back to standard timer');
          startFallbackTimer();
        }
      };
      
      // Clean up blob URL after worker is created
      URL.revokeObjectURL(workerUrl);
      return true;
    } catch (error) {
      console.warn('Failed to create Worker:', error);
      return false;
    }
  };
  
  // Fallback timer using standard setInterval with timestamp tracking
  const startFallbackTimer = () => {
    usesFallback = true;
    fallbackStartTime = Date.now();
    
    // Clear any existing fallback timer
    if (fallbackTimerId) clearInterval(fallbackTimerId);
    
    fallbackTimerId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - fallbackStartTime;
      const secondsLeft = Math.max(0, Math.ceil((currentIntervalMs - elapsed) / 1000));
      
      onTick(secondsLeft, elapsed);
      
      if (elapsed >= currentIntervalMs) {
        console.log('⏰ Fallback: Interval complete');
        fallbackStartTime = Date.now(); // Reset for next interval
        Promise.resolve(onIntervalComplete()).catch((error) => {
          console.error('Error in onIntervalComplete:', error);
          onError?.(error);
        });
      }
    }, 1000);
    
    console.log(`✅ Fallback timer started: ${currentIntervalMs / 1000 / 60} minutes`);
  };
  
  // Handle visibility change for fallback timer recovery
  const handleVisibilityChange = () => {
    if (usesFallback && running && !document.hidden) {
      // Tab became visible - recalculate elapsed time
      const now = Date.now();
      const elapsed = now - fallbackStartTime;
      
      // Check if we missed an interval while hidden
      if (elapsed >= currentIntervalMs) {
        const missedIntervals = Math.floor(elapsed / currentIntervalMs);
        console.log(`🔄 Tab visible: Missed ${missedIntervals} interval(s), catching up`);
        
        // Trigger the callback once (don't spam if multiple intervals missed)
        fallbackStartTime = Date.now();
        Promise.resolve(onIntervalComplete()).catch((error) => {
          console.error('Error in catch-up onIntervalComplete:', error);
          onError?.(error);
        });
      }
    }
  };
  
  // Initialize
  const hasWorker = initWorker();
  if (!hasWorker) {
    usesFallback = true;
  }
  
  // Add visibility change listener for fallback recovery
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  
  return {
    start: (intervalMinutes: number) => {
      currentIntervalMs = intervalMinutes * 60 * 1000;
      running = true;
      
      if (worker && !usesFallback) {
        worker.postMessage({ type: 'start', interval: currentIntervalMs });
      } else {
        startFallbackTimer();
      }
    },
    
    stop: () => {
      running = false;
      
      if (worker && !usesFallback) {
        worker.postMessage({ type: 'stop' });
      }
      
      if (fallbackTimerId) {
        clearInterval(fallbackTimerId);
        fallbackTimerId = null;
      }
    },
    
    reset: () => {
      if (worker && !usesFallback) {
        worker.postMessage({ type: 'reset' });
      }
      
      if (usesFallback) {
        fallbackStartTime = Date.now();
      }
      
      console.log('🔄 Timer reset');
    },
    
    terminate: () => {
      running = false;
      
      if (worker) {
        worker.terminate();
        worker = null;
      }
      
      if (fallbackTimerId) {
        clearInterval(fallbackTimerId);
        fallbackTimerId = null;
      }
      
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      
      console.log('🛑 Timer terminated');
    },
    
    isRunning: () => running,
  };
}
