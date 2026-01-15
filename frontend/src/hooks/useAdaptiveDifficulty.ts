import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAdaptiveDifficulty(userId: string | undefined) {
  const [currentDifficulty, setCurrentDifficulty] = useState<string>('beginner');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchAdaptiveDifficulty();
      
      // Subscribe to real-time updates
      const channel = supabase
        .channel('adaptive-difficulty-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'adaptive_difficulty',
            filter: `user_id=eq.${userId}`
          },
          (payload: any) => {
            if (payload.new?.current_difficulty) {
              setCurrentDifficulty(payload.new.current_difficulty);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userId]);

  const fetchAdaptiveDifficulty = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_adaptive_difficulty', {
        p_user_id: userId
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setCurrentDifficulty(data[0].current_difficulty);
      }
    } catch (error: any) {
      console.error("Error fetching adaptive difficulty:", error);
      setCurrentDifficulty('beginner');
    } finally {
      setLoading(false);
    }
  };

  return { currentDifficulty, loading };
}
