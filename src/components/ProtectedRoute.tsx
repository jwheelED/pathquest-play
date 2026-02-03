import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Session } from '@supabase/supabase-js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: 'instructor' | 'admin' | 'student';
  redirectTo?: string;
}

export function ProtectedRoute({ 
  children, 
  requiredRole,
  redirectTo = '/'
}: ProtectedRouteProps) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const hasCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST to catch session restoration
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') {
          // Auth is now initialized - check authorization
          checkAuthorization(session);
          setIsLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          checkAuthorization(session);
        } else if (event === 'SIGNED_OUT') {
          setAuthorized(false);
          navigate(redirectTo);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [requiredRole, redirectTo, navigate]);

  const checkAuthorization = async (session: Session | null) => {
    const cacheKey = `${requiredRole}-${location.pathname}`;
    
    if (!session) {
      toast.error("Please sign in to continue");
      setAuthorized(false);
      navigate(redirectTo);
      return;
    }

    // Skip re-check if already authorized for this role
    if (hasCheckedRef.current === cacheKey && authorized === true) {
      return;
    }

    // Use server-side RPC function to check role
    const { data: hasRole, error } = await supabase
      .rpc('has_role', { 
        _user_id: session.user.id, 
        _role: requiredRole 
      });

    if (error || !hasRole) {
      toast.error(`Access denied. ${requiredRole.charAt(0).toUpperCase() + requiredRole.slice(1)} privileges required.`);
      setAuthorized(false);
      navigate(redirectTo);
      return;
    }

    hasCheckedRef.current = cacheKey;
    setAuthorized(true);
  };

  if (isLoading || authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Verifying access...</div>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
}
