import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);

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
            Back online
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            You're offline. Some features may be limited.
          </>
        )}
      </div>
    </div>
  );
}
