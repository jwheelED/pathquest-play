import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Wifi,
  Key,
  User,
  Server,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface DiagnosticResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

export const EdgeFunctionDiagnostic = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    const diagnosticResults: DiagnosticResult[] = [];

    // Test 1: Check Supabase URL configuration
    diagnosticResults.push({
      id: 'config',
      name: 'Supabase Configuration',
      status: 'pass',
      message: 'Supabase URL is configured',
      details: `URL: https://otsmjgrhyteyvpufkwdh.supabase.co`
    });
    setResults([...diagnosticResults]);

    // Test 2: Check auth session
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        diagnosticResults.push({
          id: 'auth',
          name: 'Authentication Session',
          status: 'fail',
          message: 'Failed to get auth session',
          details: sessionError.message
        });
      } else if (!session) {
        diagnosticResults.push({
          id: 'auth',
          name: 'Authentication Session',
          status: 'fail',
          message: 'No active session - Please log in again',
          details: 'Your session may have expired. Try logging out and back in.'
        });
      } else {
        const tokenExpiry = new Date(session.expires_at! * 1000);
        const now = new Date();
        const minutesUntilExpiry = Math.round((tokenExpiry.getTime() - now.getTime()) / 60000);
        
        if (minutesUntilExpiry < 5) {
          diagnosticResults.push({
            id: 'auth',
            name: 'Authentication Session',
            status: 'warning',
            message: 'Session expiring soon',
            details: `Expires in ${minutesUntilExpiry} minutes. Try refreshing the page.`
          });
        } else {
          diagnosticResults.push({
            id: 'auth',
            name: 'Authentication Session',
            status: 'pass',
            message: 'Valid session found',
            details: `User: ${session.user.email}, Expires: ${tokenExpiry.toLocaleTimeString()}`
          });
        }
      }
    } catch (err) {
      diagnosticResults.push({
        id: 'auth',
        name: 'Authentication Session',
        status: 'fail',
        message: 'Exception checking auth',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }
    setResults([...diagnosticResults]);

    // Test 3: Try to refresh the token
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        diagnosticResults.push({
          id: 'refresh',
          name: 'Token Refresh',
          status: 'warning',
          message: 'Could not refresh token',
          details: refreshError.message
        });
      } else if (refreshData.session) {
        diagnosticResults.push({
          id: 'refresh',
          name: 'Token Refresh',
          status: 'pass',
          message: 'Token refreshed successfully',
          details: 'New token obtained'
        });
      }
    } catch (err) {
      diagnosticResults.push({
        id: 'refresh',
        name: 'Token Refresh',
        status: 'warning',
        message: 'Token refresh failed',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }
    setResults([...diagnosticResults]);

    // Test 4: Direct fetch to edge function (bypassing supabase client)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const response = await fetch(
          'https://otsmjgrhyteyvpufkwdh.supabase.co/functions/v1/health-check',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90c21qZ3JoeXRleXZwdWZrd2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MTAwMjksImV4cCI6MjA2NTI4NjAyOX0.lECUFBdhoe2gxBJSvHSMlq1BGearE97kSOL-Pz8FZbw'
            },
            body: JSON.stringify({})
          }
        );

        const responseText = await response.text();
        
        if (response.ok) {
          diagnosticResults.push({
            id: 'direct',
            name: 'Direct Edge Function Call',
            status: 'pass',
            message: 'Edge function responded successfully',
            details: `Status: ${response.status}`
          });
        } else {
          diagnosticResults.push({
            id: 'direct',
            name: 'Direct Edge Function Call',
            status: 'fail',
            message: `Edge function returned error: ${response.status}`,
            details: responseText.substring(0, 200)
          });
        }
      } else {
        diagnosticResults.push({
          id: 'direct',
          name: 'Direct Edge Function Call',
          status: 'warning',
          message: 'Skipped - no auth session',
          details: 'Cannot test without valid session'
        });
      }
    } catch (err) {
      diagnosticResults.push({
        id: 'direct',
        name: 'Direct Edge Function Call',
        status: 'fail',
        message: 'Network error calling edge function',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }
    setResults([...diagnosticResults]);

    // Test 5: Supabase client invoke method
    try {
      const { data, error } = await supabase.functions.invoke('health-check', {
        body: {}
      });

      if (error) {
        diagnosticResults.push({
          id: 'invoke',
          name: 'Supabase Client Invoke',
          status: 'fail',
          message: 'supabase.functions.invoke failed',
          details: error.message
        });
      } else {
        diagnosticResults.push({
          id: 'invoke',
          name: 'Supabase Client Invoke',
          status: 'pass',
          message: 'Invoke method working',
          details: `Response: ${JSON.stringify(data).substring(0, 100)}`
        });
      }
    } catch (err) {
      diagnosticResults.push({
        id: 'invoke',
        name: 'Supabase Client Invoke',
        status: 'fail',
        message: 'Exception during invoke',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }
    setResults([...diagnosticResults]);

    // Final summary
    const failCount = diagnosticResults.filter(r => r.status === 'fail').length;
    if (failCount === 0) {
      toast.success('All diagnostics passed!');
    } else {
      toast.error(`${failCount} diagnostic(s) failed`);
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'fail': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const handleLogoutAndLogin = async () => {
    await supabase.auth.signOut();
    window.location.href = '/instructor/auth';
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Edge Function Diagnostic Tool
        </CardTitle>
        <CardDescription>
          Diagnose why edge function calls are failing
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={runDiagnostics} 
            disabled={isRunning}
            className="flex-1"
          >
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running Diagnostics...</>
            ) : (
              <><Wifi className="h-4 w-4 mr-2" /> Run Diagnostics</>
            )}
          </Button>
          <Button 
            onClick={handleLogoutAndLogin}
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Re-login
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((result) => (
              <Alert 
                key={result.id}
                variant={result.status === 'fail' ? 'destructive' : 'default'}
                className={
                  result.status === 'pass' 
                    ? 'border-green-500/50 bg-green-500/5' 
                    : result.status === 'warning'
                    ? 'border-yellow-500/50 bg-yellow-500/5'
                    : ''
                }
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex-1 space-y-1">
                    <span className="font-semibold text-sm">{result.name}</span>
                    <AlertDescription className="text-xs">
                      {result.message}
                    </AlertDescription>
                    {result.details && (
                      <AlertDescription className="text-xs opacity-70 font-mono break-all">
                        {result.details}
                      </AlertDescription>
                    )}
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Common fixes:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>If "Authentication Session" fails: Click "Re-login" button above</li>
              <li>If "Direct Edge Function Call" fails: Check browser console for CORS errors</li>
              <li>If "Supabase Client Invoke" fails: The auth token might not be sent properly</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
