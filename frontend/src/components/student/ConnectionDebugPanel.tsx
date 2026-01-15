import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

interface DebugInfo {
  userId: string | null;
  sessionValid: boolean;
  sessionExpiry: string | null;
  realtimeStatus: string;
  assignmentCount: number;
  recentAssignments: Array<{
    id: string;
    title: string;
    created_at: string;
  }>;
  instructorConnected: boolean;
  instructorId: string | null;
}

export const ConnectionDebugPanel = ({ userId }: { userId: string }) => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    userId: null,
    sessionValid: false,
    sessionExpiry: null,
    realtimeStatus: 'checking',
    assignmentCount: 0,
    recentAssignments: [],
    instructorConnected: false,
    instructorId: null
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkDebugInfo = async () => {
    setIsChecking(true);
    
    try {
      // 1. Check session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const sessionValid = !!session && !sessionError;
      
      // 2. Check user matches
      const { data: { user } } = await supabase.auth.getUser();
      const userIdMatch = user?.id === userId;
      
      // 3. Check instructor connection
      const { data: connection } = await supabase
        .from('instructor_students')
        .select('instructor_id')
        .eq('student_id', userId)
        .maybeSingle();
      
      // 4. Fetch recent assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('student_assignments')
        .select('id, title, created_at')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.log('🔍 Debug check:', {
        sessionValid,
        userIdMatch,
        userId: user?.id,
        expectedUserId: userId,
        assignmentsFound: assignments?.length || 0,
        assignmentsError,
        instructorConnected: !!connection
      });
      
      setDebugInfo({
        userId: user?.id || null,
        sessionValid,
        sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : null,
        realtimeStatus: sessionValid ? 'connected' : 'disconnected',
        assignmentCount: assignments?.length || 0,
        recentAssignments: assignments || [],
        instructorConnected: !!connection,
        instructorId: connection?.instructor_id || null
      });
      
      if (!sessionValid) {
        toast.error("Session invalid - please logout and login again");
      } else if (!userIdMatch) {
        toast.error("User ID mismatch detected - please logout and login again");
      } else if (!connection) {
        toast.error("No instructor connection found - please re-enter class code");
      } else if (assignmentsError) {
        toast.error("Cannot fetch assignments - RLS may be blocking access");
      }
      
    } catch (error) {
      console.error('Debug check failed:', error);
      toast.error("Debug check failed");
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (isExpanded) {
      checkDebugInfo();
    }
  }, [isExpanded, userId]);

  const handleRefresh = () => {
    checkDebugInfo();
  };

  const handleLogoutLogin = async () => {
    localStorage.clear();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const getStatusIcon = (isOk: boolean) => {
    return isOk ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-24 right-4 z-50 md:bottom-4"
      >
        <Wifi className="h-4 w-4 mr-2" />
        Connection Status
      </Button>
    );
  }

  const hasIssues = !debugInfo.sessionValid || !debugInfo.instructorConnected || debugInfo.userId !== userId;

  return (
    <Card className="fixed bottom-24 right-4 z-50 w-96 md:bottom-4 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {debugInfo.realtimeStatus === 'connected' ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            Connection Debug
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isChecking}
            >
              <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              ×
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {hasIssues && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Issues detected! Questions may not be received.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">User ID Match:</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.userId === userId)}
              <Badge variant={debugInfo.userId === userId ? "default" : "destructive"} className="text-xs">
                {debugInfo.userId === userId ? 'Match' : 'Mismatch'}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Session Valid:</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.sessionValid)}
              <Badge variant={debugInfo.sessionValid ? "default" : "destructive"} className="text-xs">
                {debugInfo.sessionValid ? 'Valid' : 'Invalid'}
              </Badge>
            </div>
          </div>
          
          {debugInfo.sessionExpiry && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires:</span>
              <span className="text-xs">{debugInfo.sessionExpiry}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Instructor Link:</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.instructorConnected)}
              <Badge variant={debugInfo.instructorConnected ? "default" : "destructive"} className="text-xs">
                {debugInfo.instructorConnected ? 'Connected' : 'Missing'}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Realtime:</span>
            <Badge variant={debugInfo.realtimeStatus === 'connected' ? "default" : "secondary"} className="text-xs">
              {debugInfo.realtimeStatus}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Assignments:</span>
            <Badge variant="secondary" className="text-xs">
              {debugInfo.assignmentCount} total
            </Badge>
          </div>
        </div>
        
        {debugInfo.recentAssignments.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-muted-foreground mb-1">Recent Assignments:</p>
            <div className="space-y-1">
              {debugInfo.recentAssignments.map((assignment) => (
                <div key={assignment.id} className="flex justify-between items-center text-xs">
                  <span className="truncate flex-1">{assignment.title}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(assignment.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {hasIssues && (
          <Button
            onClick={handleLogoutLogin}
            variant="destructive"
            size="sm"
            className="w-full"
          >
            Fix Issues (Logout & Login)
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
