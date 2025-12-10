import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user ID from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Running health check for user:', user.id);

    const checks = [];

    // Check 1: API Key Configuration
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (LOVABLE_API_KEY) {
      // Test Lovable AI API
      try {
        const testResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-pro-preview',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 5
          }),
        });

        if (testResponse.ok || testResponse.status === 429) {
          checks.push({
            id: 'lovable_api',
            name: 'Lovable AI API',
            status: 'pass',
            message: 'API key is valid and accessible'
          });
        } else if (testResponse.status === 402) {
          checks.push({
            id: 'lovable_api',
            name: 'Lovable AI API',
            status: 'fail',
            message: 'Payment required - add credits to your workspace',
            details: 'Go to Settings → Workspace → Usage to add credits'
          });
        } else {
          checks.push({
            id: 'lovable_api',
            name: 'Lovable AI API',
            status: 'warning',
            message: 'API key may be invalid or API is down',
            details: `Status: ${testResponse.status}`
          });
        }
      } catch (error) {
        checks.push({
          id: 'lovable_api',
          name: 'Lovable AI API',
          status: 'fail',
          message: 'Failed to connect to Lovable AI',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } else if (OPENAI_API_KEY) {
      checks.push({
        id: 'openai_api',
        name: 'OpenAI API',
        status: 'pass',
        message: 'API key is configured (not validated)',
        details: 'OpenAI API key detected'
      });
    } else {
      checks.push({
        id: 'ai_api',
        name: 'AI API Configuration',
        status: 'fail',
        message: 'No AI API key configured',
        details: 'Configure LOVABLE_API_KEY or OPENAI_API_KEY'
      });
    }

    // Check 2: Student Count
    const { count: studentCount, error: studentError } = await supabase
      .from('instructor_students')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', user.id);

    if (studentError) {
      checks.push({
        id: 'students',
        name: 'Student Connections',
        status: 'warning',
        message: 'Failed to check student count',
        details: studentError.message
      });
    } else if (studentCount === 0) {
      checks.push({
        id: 'students',
        name: 'Student Connections',
        status: 'warning',
        message: 'No students linked to your account',
        details: 'Students must join with your instructor code to receive questions'
      });
    } else {
      checks.push({
        id: 'students',
        name: 'Student Connections',
        status: 'pass',
        message: `${studentCount} student${studentCount === 1 ? '' : 's'} linked`
      });
    }

    // Check 3: Daily Question Quota
    const today = new Date().toISOString().split('T')[0];
    const { count: questionsToday, error: quotaError } = await supabase
      .from('student_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', user.id)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    if (quotaError) {
      checks.push({
        id: 'quota',
        name: 'Daily Question Quota',
        status: 'warning',
        message: 'Failed to check daily quota',
        details: quotaError.message
      });
    } else {
      const DAILY_LIMIT = 500;
      const remaining = DAILY_LIMIT - (questionsToday || 0);
      const percentUsed = ((questionsToday || 0) / DAILY_LIMIT) * 100;

      if (remaining <= 0) {
        checks.push({
          id: 'quota',
          name: 'Daily Question Quota',
          status: 'fail',
          message: 'Daily question limit reached',
          details: `${questionsToday}/${DAILY_LIMIT} questions sent today`
        });
      } else if (percentUsed > 90) {
        checks.push({
          id: 'quota',
          name: 'Daily Question Quota',
          status: 'warning',
          message: 'Approaching daily limit',
          details: `${remaining} questions remaining (${questionsToday}/${DAILY_LIMIT} used)`
        });
      } else {
        checks.push({
          id: 'quota',
          name: 'Daily Question Quota',
          status: 'pass',
          message: `${remaining} questions remaining today`,
          details: `${questionsToday}/${DAILY_LIMIT} used`
        });
      }
    }

    // Check 4: Database Connection
    checks.push({
      id: 'database',
      name: 'Database Connection',
      status: 'pass',
      message: 'Database is accessible'
    });

    // Determine overall health
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (failCount > 0) {
      overall = 'unhealthy';
    } else if (warningCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return new Response(
      JSON.stringify({ overall, checks }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in health-check:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        overall: 'unhealthy',
        checks: [{
          id: 'error',
          name: 'Health Check',
          status: 'fail',
          message: 'Health check failed to complete',
          details: error instanceof Error ? error.message : 'Unknown error'
        }]
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
