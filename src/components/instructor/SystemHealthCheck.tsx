import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    id: string;
    name: string;
    status: 'pass' | 'warning' | 'fail';
    message: string;
    details?: string;
  }[];
  timestamp: Date;
}

export function SystemHealthCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const { toast } = useToast();

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('health-check');
      
      if (error) throw error;
      
      setResult({
        ...data,
        timestamp: new Date()
      });
      
      if (data.overall === 'unhealthy') {
        toast({
          title: "System Health Check Failed",
          description: "Critical issues detected. Please review before starting a lecture.",
          variant: "destructive"
        });
      } else if (data.overall === 'degraded') {
        toast({
          title: "System Health Check Warning",
          description: "Some issues detected but system is operational.",
          variant: "default"
        });
      } else {
        toast({
          title: "System Health Check Passed",
          description: "All systems are operational.",
        });
      }
    } catch (error) {
      console.error('Health check error:', error);
      toast({
        title: "Health Check Failed",
        description: "Failed to run system health check. Please check your connection.",
        variant: "destructive"
      });
    } finally {
      setChecking(false);
    }
  };

  const getStatusIcon = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getOverallBadge = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500">Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-orange-500">Degraded</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">System Health Check</CardTitle>
            <CardDescription>
              Verify all systems are ready before starting a lecture
            </CardDescription>
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={checking}
            variant="outline"
            size="sm"
          >
            {checking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run Check
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {!result && !checking && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Click "Run Check" to verify system health</p>
          </div>
        )}
        
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <p className="text-sm font-medium">Overall Status</p>
                <p className="text-xs text-muted-foreground">
                  Last checked: {result.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {getOverallBadge(result.overall)}
            </div>
            
            <div className="space-y-2">
              {result.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                >
                  {getStatusIcon(check.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {check.message}
                    </p>
                    {check.details && (
                      <p className="text-xs text-muted-foreground mt-1 break-words opacity-70">
                        {check.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
