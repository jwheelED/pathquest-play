import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

function getCurrentScriptHash(): string | null {
  const scripts = document.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = (script as HTMLScriptElement).src;
    // Vite hashed assets look like /assets/index-a1b2c3d4.js
    const match = src.match(/\/assets\/index-([a-f0-9]+)\.js/);
    if (match) return match[1];
  }
  return null;
}

async function fetchRemoteHash(): Promise<string | null> {
  try {
    const res = await fetch(`${window.location.origin}/?_check=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/\/assets\/index-([a-f0-9]+)\.js/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const initialHash = useRef<string | null>(null);
  const hasNotified = useRef(false);

  const check = useCallback(async () => {
    if (hasNotified.current) return;

    if (!initialHash.current) {
      initialHash.current = getCurrentScriptHash();
      if (!initialHash.current) return;
    }

    const remoteHash = await fetchRemoteHash();
    if (!remoteHash || remoteHash === initialHash.current) return;

    hasNotified.current = true;
    toast("Update Available", {
      description: "A new version of Edvana is ready.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
    });
  }, []);

  useEffect(() => {
    // Listen for service worker updates and reload immediately
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hasNotified.current) {
          window.location.reload();
        }
      });
    }

    // Check when user returns to the tab (biggest win for freshness)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also check on window focus (catches alt-tab scenarios)
    window.addEventListener('focus', check);

    // First check after a short delay
    const timeout = setTimeout(check, 3_000);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', check);
    };
  }, [check]);
}
