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

// Blocked patterns for security - prevents dangerous code execution
// Uses multiple detection methods to prevent common bypass techniques
const BLOCKED_PATTERNS = [
  // File system operations
  /\bopen\s*\(/i,
  /\bwrite\s*\(/i,
  /\bread\s*\(/i,
  /\bfs\./i,
  /\brequire\s*\(\s*['"]fs['"]\s*\)/i,
  /\bimport\s+.*\bos\b/i,
  /\bimport\s+.*\bsys\b/i,
  /\bimport\s+.*\bsubprocess\b/i,
  /\bimport\s+.*\bshutil\b/i,
  /\bimport\s+.*\bpickle\b/i,
  /\bimport\s+.*\bmarshall\b/i,
  // Network operations
  /\bfetch\s*\(/i,
  /\brequests\./i,
  /\burllib/i,
  /\bsocket\b/i,
  /\bhttp\./i,
  /\bimport\s+.*\brequests\b/i,
  // Code execution
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /\bcompile\s*\(/i,
  /\b__import__\s*\(/i,
  // System commands
  /\bos\.system\s*\(/i,
  /\bos\.popen\s*\(/i,
  /\bsubprocess\./i,
  /\bchild_process/i,
  /\bspawn\s*\(/i,
  /\bexecSync\s*\(/i,
  // Dangerous globals
  /\bglobals\s*\(\s*\)/i,
  /\blocals\s*\(\s*\)/i,
  /\bgetattr\s*\(/i,
  /\bsetattr\s*\(/i,
  // Python specific dangerous patterns
  /\b__builtins__/i,
  /\b__class__/i,
  /\b__mro__/i,
  /\b__subclasses__/i,
  /\b__bases__/i,
  /\bimportlib/i,
  /\bpkgutil/i,
  // Encoding bypass attempts
  /\\u00[0-9a-f]{2}/i, // Unicode escapes
  /\\x[0-9a-f]{2}/i,   // Hex escapes
  /base64\.(decode|b64decode)/i,
  /codecs\.(decode|encode)/i,
  // JavaScript specific
  /\bFunction\s*\(/i,
  /\bprocess\./i,
  /\brequire\s*\(/i,
  /\bimport\s*\(/i,
];

// Additional string-based checks for obfuscation attempts
function detectObfuscation(code: string): boolean {
  // Check for string concatenation that forms dangerous keywords
  const dangerousKeywords = ['eval', 'exec', 'open', 'import', 'require', 'system', 'popen'];
  const loweredCode = code.toLowerCase();
  
  for (const keyword of dangerousKeywords) {
    // Check for character-by-character concatenation like 'e'+'v'+'a'+'l'
    const concatPattern = keyword.split('').map(c => `['"]${c}['"]`).join('\\s*\\+\\s*');
    if (new RegExp(concatPattern, 'i').test(code)) {
      return true;
    }
    
    // Check for chr() or String.fromCharCode() building
    const charCodes = keyword.split('').map(c => c.charCodeAt(0));
    for (const charCode of charCodes) {
      if (loweredCode.includes(`chr(${charCode})`) || loweredCode.includes(`fromcharcode(${charCode})`)) {
        return true;
      }
    }
  }
  
  return false;
}

// Validate code for dangerous patterns
function validateCode(code: string): { valid: boolean; reason?: string } {
  // Check for excessive code length first
  if (code.length > 10000) {
    return { valid: false, reason: 'Code exceeds maximum length (10000 characters)' };
  }
  
  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      console.warn(`Blocked pattern detected: ${pattern.source}`);
      return { valid: false, reason: `Code contains blocked pattern` };
    }
  }
  
  // Check for obfuscation attempts
  if (detectObfuscation(code)) {
    console.warn('Obfuscation attempt detected');
    return { valid: false, reason: 'Obfuscated code detected' };
  }
  
  // Check for excessive nesting depth (potential DoS)
  const maxNesting = 20;
  let currentNesting = 0;
  let maxFound = 0;
  for (const char of code) {
    if (char === '(' || char === '[' || char === '{') {
      currentNesting++;
      maxFound = Math.max(maxFound, currentNesting);
    } else if (char === ')' || char === ']' || char === '}') {
      currentNesting--;
    }
  }
  if (maxFound > maxNesting) {
    return { valid: false, reason: 'Excessive nesting depth' };
  }
  
  return { valid: true };
}

// Validate test cases
function validateTestCases(testCases: any[]): { valid: boolean; reason?: string } {
  if (testCases.length > 20) {
    return { valid: false, reason: 'Too many test cases (max 20)' };
  }
  
  for (const testCase of testCases) {
    if (typeof testCase.input !== 'string' || testCase.input.length > 1000) {
      return { valid: false, reason: 'Invalid test case input' };
    }
    
    // Check test case input for dangerous patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(testCase.input)) {
        return { valid: false, reason: `Test case contains blocked pattern` };
      }
    }
  }
  
  return { valid: true };
}

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

    // Validate code for dangerous patterns
    const codeValidation = validateCode(code);
    if (!codeValidation.valid) {
      console.warn(`Code validation failed: ${codeValidation.reason}`);
      return new Response(
        JSON.stringify({ error: 'Code validation failed: potentially unsafe code detected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate test cases
    const testCaseValidation = validateTestCases(testCases);
    if (!testCaseValidation.valid) {
      console.warn(`Test case validation failed: ${testCaseValidation.reason}`);
      return new Response(
        JSON.stringify({ error: 'Test case validation failed: potentially unsafe content detected' }),
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
