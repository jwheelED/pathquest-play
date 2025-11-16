import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Language mapping for Piston API
const languageMap: Record<string, { language: string; version: string }> = {
  python: { language: 'python', version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'cpp', version: '10.2.0' },
  c: { language: 'c', version: '10.2.0' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, language, testCases } = await req.json();

    if (!code || !language || !testCases || !Array.isArray(testCases)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code, language, testCases' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pistonConfig = languageMap[language.toLowerCase()];
    if (!pistonConfig) {
      return new Response(
        JSON.stringify({ error: `Unsupported language: ${language}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute code for each test case
    const results = [];
    
    for (const testCase of testCases) {
      try {
        // Prepare code with test case input
        const fullCode = `${code}\n\n# Test execution\nresult = ${testCase.input}\nprint(result)`;

        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: pistonConfig.language,
            version: pistonConfig.version,
            files: [{ content: fullCode }],
            stdin: '',
            args: [],
            compile_timeout: 10000,
            run_timeout: 3000,
            compile_memory_limit: -1,
            run_memory_limit: -1,
          }),
        });

        if (!response.ok) {
          throw new Error(`Piston API error: ${response.status}`);
        }

        const result = await response.json();
        
        // Check if execution was successful
        if (result.run && result.run.code === 0) {
          const output = result.run.stdout.trim();
          const expected = String(testCase.expectedOutput).trim();
          const passed = output === expected;

          results.push({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            actualOutput: output,
            passed,
            error: null,
          });
        } else {
          // Runtime or compilation error
          const errorMsg = result.run?.stderr || result.compile?.stderr || 'Unknown error';
          results.push({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            actualOutput: null,
            passed: false,
            error: errorMsg,
          });
        }
      } catch (error: any) {
        results.push({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: null,
          passed: false,
          error: error.message || 'Execution failed',
        });
      }
    }

    const allPassed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;

    return new Response(
      JSON.stringify({
        success: true,
        allPassed,
        passedCount,
        totalCount: testCases.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Code execution error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to execute code' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
