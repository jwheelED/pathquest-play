import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SESSION_CHECK_INTERVAL = 30 * 1000; // 30 seconds

export const useAuthRefresh = (isActive: boolean = true) => {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  const clearAllIntervals = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      clearAllIntervals();
      return;
    }

    const refreshToken = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('Token refresh failed:', error);
          toastRef.current({
            title: "⚠️ Session refresh failed",
            description: "Your session may expire soon. Please save your work.",
            variant: "destructive",
          });
          return;
        }

        if (session) {
          lastRefreshRef.current = Date.now();
          console.log('✅ Token refreshed successfully');
        }
      } catch (error) {
        console.error('Token refresh error:', error);
      }
    };

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.warn('⚠️ No active session detected');
          toastRef.current({
            title: "Session expired",
            description: "Please log in again to continue",
            variant: "destructive",
          });
          clearAllIntervals();
        }
      } catch (error) {
        console.error('Session check error:', error);
      }
    };

    refreshToken();

    refreshIntervalRef.current = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);
    checkIntervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL);

    return clearAllIntervals;
  }, [isActive, clearAllIntervals]);

  return {
    lastRefresh: lastRefreshRef.current,
  };
};
