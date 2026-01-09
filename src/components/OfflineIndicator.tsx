import { WifiOff, Wifi, Clock } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useEffect, useState, useCallback } from "react";
import { offlineQueue } from "@/lib/offlineQueue";
import { toast } from "sonner";

interface SyncCompleteEvent extends CustomEvent {
  detail: { synced: number; failed: number };
}

export function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending items count
  const checkPendingCount = useCallback(async () => {
    try {
      const items = await offlineQueue.getAll();
      setPendingCount(items.length);
    } catch (error) {
      console.error("Failed to get pending count:", error);
    }
  }, []);

  // Handle sync completion event
  useEffect(() => {
    const handleSyncComplete = (event: Event) => {
      const { synced, failed } = (event as SyncCompleteEvent).detail;
      
      if (synced > 0) {
        toast.success(`Synced ${synced} pending action${synced > 1 ? 's' : ''}`);
      }
      if (failed > 0) {
        toast.error(`Failed to sync ${failed} action${failed > 1 ? 's' : ''}`);
      }
      
      // Refresh pending count
      checkPendingCount();
    };

    window.addEventListener('offline-sync-complete', handleSyncComplete);
    return () => window.removeEventListener('offline-sync-complete', handleSyncComplete);
  }, [checkPendingCount]);

  // Check pending count on mount and when offline
  useEffect(() => {
    checkPendingCount();
  }, [isOnline, checkPendingCount]);

  useEffect(() => {
    if (!isOnline) {
      setHasBeenOffline(true);
    }
    
    if (isOnline && hasBeenOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setHasBeenOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, hasBeenOffline]);

  // Show indicator if offline OR if we just reconnected
  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium ${
        isOnline
          ? "bg-green-500 text-white"
          : "bg-destructive text-destructive-foreground"
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            Back online{pendingCount > 0 ? ` - syncing ${pendingCount} pending action${pendingCount > 1 ? 's' : ''}...` : ''}
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            You're offline.
            {pendingCount > 0 ? (
              <span className="flex items-center gap-1 ml-1">
                <Clock className="h-3 w-3" />
                {pendingCount} action{pendingCount > 1 ? 's' : ''} will sync when connected.
              </span>
            ) : (
              <span className="ml-1">Some features may be limited.</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
