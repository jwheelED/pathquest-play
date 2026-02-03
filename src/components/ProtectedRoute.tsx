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
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          // Auth is now initialized - check authorization
          // Use setTimeout to avoid blocking the auth callback
          setTimeout(async () => {
            try {
              await checkAuthorization(session);
            } catch (error) {
              console.error('Authorization check failed:', error);
              setAuthorized(false);
            } finally {
              setIsLoading(false);
            }
          }, 0);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try {
            await checkAuthorization(session);
          } catch (error) {
            console.error('Authorization check failed:', error);
          }
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

    try {
      // Use server-side RPC function to check role
      const { data: hasRole, error } = await supabase
        .rpc('has_role', { 
          _user_id: session.user.id, 
          _role: requiredRole 
        });

      if (error) {
        console.error('Role check error:', error);
        toast.error(`Access denied. ${requiredRole.charAt(0).toUpperCase() + requiredRole.slice(1)} privileges required.`);
        setAuthorized(false);
        navigate(redirectTo);
        return;
      }

      if (!hasRole) {
        toast.error(`Access denied. ${requiredRole.charAt(0).toUpperCase() + requiredRole.slice(1)} privileges required.`);
        setAuthorized(false);
        navigate(redirectTo);
        return;
      }

      hasCheckedRef.current = cacheKey;
      setAuthorized(true);
    } catch (error) {
      console.error('Unexpected error during authorization:', error);
      toast.error('An error occurred while verifying access');
      setAuthorized(false);
      navigate(redirectTo);
    }
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
