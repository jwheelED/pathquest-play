import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useOrgId = (userId?: string) => {
  return useQuery({
    queryKey: ["org-id", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data?.org_id || null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

export const getOrgId = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching org_id:", error);
    return null;
  }
  
  return data?.org_id || null;
};
