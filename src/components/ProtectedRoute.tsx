import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const navigate = useNavigate();
  const location = useLocation();
  const hasCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    // Only check if we haven't already authorized for this role
    // This prevents re-checking on every route change within the same role
    const cacheKey = `${requiredRole}-${location.pathname}`;
    if (hasCheckedRef.current === cacheKey && authorized === true) {
      return;
    }
    
    checkAuthorization(cacheKey);
  }, [location.pathname, requiredRole]);

  const checkAuthorization = async (cacheKey: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      toast.error("Please sign in to continue");
      navigate(redirectTo);
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
      navigate(redirectTo);
      return;
    }

    hasCheckedRef.current = cacheKey;
    setAuthorized(true);
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Verifying access...</div>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
}
