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
  Zap,
  Server,
  Database,
  Users,
  Activity
} from "lucide-react";
import { toast } from "sonner";

interface HealthCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  responseTime?: number;
}

export const EdgeFunctionHealthCheck = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runHealthCheck = async () => {
    setIsChecking(true);
    const startTime = Date.now();

    try {
      console.log('🏥 Starting health check...');
      
      const { data, error } = await supabase.functions.invoke('health-check', {
        body: {}
      });

      const responseTime = Date.now() - startTime;

      if (error) {
        console.error('❌ Health check failed:', error);
        setResult({
          overall: 'unhealthy',
          checks: [{
            id: 'connection',
            name: 'Edge Function Connection',
            status: 'fail',
            message: 'Failed to connect to edge functions',
            details: error.message
          }],
          responseTime
        });
        toast.error('Health check failed: ' + error.message);
      } else {
        console.log('✅ Health check completed:', data);
        setResult({
          ...data,
          responseTime
        });
        
        if (data.overall === 'healthy') {
          toast.success('All systems operational');
        } else if (data.overall === 'degraded') {
          toast.warning('Some systems need attention');
        } else {
          toast.error('Critical issues detected');
        }
      }

      setLastChecked(new Date());
    } catch (error) {
      console.error('❌ Health check exception:', error);
      const responseTime = Date.now() - startTime;
      
      setResult({
        overall: 'unhealthy',
        checks: [{
          id: 'exception',
          name: 'Health Check',
          status: 'fail',
          message: 'Exception during health check',
          details: error instanceof Error ? error.message : 'Unknown error'
        }],
        responseTime
      });
      
      toast.error('Health check failed with exception');
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getCheckIcon = (id: string) => {
    switch (id) {
      case 'lovable_api':
      case 'openai_api':
      case 'ai_api':
        return <Zap className="h-4 w-4" />;
      case 'students':
        return <Users className="h-4 w-4" />;
      case 'quota':
        return <Activity className="h-4 w-4" />;
      case 'database':
        return <Database className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  const getOverallColor = () => {
    if (!result) return "border-muted";
    switch (result.overall) {
      case 'healthy':
        return "border-green-500/50 bg-green-500/5";
      case 'degraded':
        return "border-yellow-500/50 bg-yellow-500/5";
      case 'unhealthy':
        return "border-destructive/50 bg-destructive/5";
    }
  };

  return (
    <Card className={`border-2 ${getOverallColor()}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" />
              System Health Check
            </CardTitle>
            <CardDescription>
              Verify edge functions and system connectivity
            </CardDescription>
          </div>
          {result && (
            <Badge 
              variant={
                result.overall === 'healthy' 
                  ? 'default' 
                  : result.overall === 'degraded' 
                  ? 'secondary' 
                  : 'destructive'
              }
            >
              {result.overall.toUpperCase()}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button 
          onClick={runHealthCheck} 
          disabled={isChecking}
          className="w-full"
          size="lg"
        >
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running Health Check...
            </>
          ) : (
            <>
              <Activity className="h-4 w-4 mr-2" />
              Run Health Check
            </>
          )}
        </Button>

        {lastChecked && (
          <div className="text-xs text-muted-foreground text-center">
            Last checked: {lastChecked.toLocaleTimeString()}
            {result?.responseTime && ` (${result.responseTime}ms)`}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {result.checks.map((check) => (
              <Alert 
                key={check.id}
                variant={check.status === 'fail' ? 'destructive' : 'default'}
                className={
                  check.status === 'pass' 
                    ? 'border-green-500/50 bg-green-500/5' 
                    : check.status === 'warning'
                    ? 'border-yellow-500/50 bg-yellow-500/5'
                    : ''
                }
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getStatusIcon(check.status)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {getCheckIcon(check.id)}
                      <span className="font-semibold text-sm">{check.name}</span>
                    </div>
                    <AlertDescription className="text-xs">
                      {check.message}
                    </AlertDescription>
                    {check.details && (
                      <AlertDescription className="text-xs opacity-70 font-mono">
                        {check.details}
                      </AlertDescription>
                    )}
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {!result && !isChecking && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Click "Run Health Check" to verify system status
          </div>
        )}
      </CardContent>
    </Card>
  );
};
