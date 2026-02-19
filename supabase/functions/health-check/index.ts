import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("🏥 Health check started");

  const checks: Array<{
    id: string;
    name: string;
    status: "pass" | "fail" | "warning";
    message: string;
    details?: string;
  }> = [];

  // Check 1: LOVABLE_API_KEY configured
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  checks.push({
    id: "lovable_api",
    name: "AI API Key",
    status: lovableKey ? "pass" : "fail",
    message: lovableKey ? "LOVABLE_API_KEY is configured" : "LOVABLE_API_KEY is missing",
  });

  // Check 2: Supabase connection
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  checks.push({
    id: "database",
    name: "Database Connection",
    status: supabaseUrl && supabaseKey ? "pass" : "fail",
    message: supabaseUrl && supabaseKey ? "Supabase configured" : "Supabase credentials missing",
  });

  // Check 3: Service key (for admin operations)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  checks.push({
    id: "service_role",
    name: "Service Role Key",
    status: serviceKey ? "pass" : "warning",
    message: serviceKey ? "Service role key available" : "Service role key not configured (some features may be limited)",
  });

  // Check 4: Deepgram API (for transcription)
  const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
  checks.push({
    id: "deepgram",
    name: "Deepgram Transcription",
    status: deepgramKey ? "pass" : "warning",
    message: deepgramKey ? "Deepgram API configured" : "Deepgram API not configured (voice features may be limited)",
  });

  // Calculate overall status
  const failedChecks = checks.filter((c) => c.status === "fail");
  const warningChecks = checks.filter((c) => c.status === "warning");
  
  let overall: "healthy" | "degraded" | "unhealthy";
  if (failedChecks.length === 0 && warningChecks.length === 0) {
    overall = "healthy";
  } else if (failedChecks.length === 0) {
    overall = "degraded";
  } else {
    overall = "unhealthy";
  }

  console.log(`🏥 Health check complete: ${overall} (${failedChecks.length} failed, ${warningChecks.length} warnings)`);

  return new Response(
    JSON.stringify({ 
      overall, 
      checks,
      timestamp: new Date().toISOString(),
    }),
    { 
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json" 
      } 
    }
  );
});
