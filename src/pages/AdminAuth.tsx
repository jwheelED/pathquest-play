import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // CLIENT-SIDE CHECK: This is for UX only!
        // Security is enforced server-side via RLS policies.
        // Never rely on this check alone for authorization.
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        
        if (roleData) {
          navigate("/admin/dashboard");
        }
      }
    };
    checkSession();
  }, [navigate]);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: name,
              role: "admin"
            }
          }
        });
        if (error) throw error;

        if (data.user) {
          if (data.user.identities && data.user.identities.length === 0) {
            toast.error("This email is already registered. Please sign in instead.");
            setIsSignUp(false);
          } else if (data.session) {
            toast.success("Account created successfully!");
            navigate("/admin/dashboard");
          } else {
            toast.success("Account created! Please check your email to confirm your account before signing in.");
            setIsSignUp(false);
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleData, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          
          if (roleError) {
            console.error("Role fetch error:", roleError);
            toast.error("Error checking admin status");
            await supabase.auth.signOut();
            return;
          }

          if (roleData) {
            navigate("/admin/dashboard");
          } else {
            toast.error("This account is not registered as an administrator");
            await supabase.auth.signOut();
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-accent/10 p-4">
      <Card className="w-full max-w-md border-2 border-accent shadow-glow">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-foreground">
            Administrator Portal
          </CardTitle>
          <CardDescription>
            {isSignUp ? "Create your administrator account" : "Sign in to access analytics and reports"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSignUp && (
            <Input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="retro-input"
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            className="retro-input"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="retro-input"
          />
          <Button
            onClick={handleAuth}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-glow"
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            <Link to="/" className="text-foreground hover:underline">
              ← Back to Home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
