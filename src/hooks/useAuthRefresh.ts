import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SESSION_CHECK_INTERVAL = 30 * 1000; // 30 seconds

export const useAuthRefresh = (isActive: boolean = true) => {
  const { toast } = useToast();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isActive) {
      // Clean up intervals when not active
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Proactive token refresh every 10 minutes
    const refreshToken = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('Token refresh failed:', error);
          toast({
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

    // Session health check every 30 seconds
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.warn('⚠️ No active session detected');
          toast({
            title: "Session expired",
            description: "Please log in again to continue",
            variant: "destructive",
          });
          
          // Clear intervals
          if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
        }
      } catch (error) {
        console.error('Session check error:', error);
      }
    };

    // Initial refresh
    refreshToken();

    // Set up refresh interval
    refreshIntervalRef.current = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);

    // Set up session check interval
    checkIntervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [isActive, toast]);

  return {
    lastRefresh: lastRefreshRef.current,
  };
};
