import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { instructorAdminSignUpSchema, signInSchema } from "@/lib/validation";

export default function InstructorAuth() {
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
          .eq("role", "instructor")
          .maybeSingle();
        
        if (roleData) {
          navigate("/instructor/dashboard");
        }
      }
    };
    checkSession();
  }, [navigate]);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (isSignUp) {
        // Validate instructor signup inputs
        const validationResult = instructorAdminSignUpSchema.safeParse({
          email: email.trim(),
          password,
          name: name.trim()
        });

        if (!validationResult.success) {
          const firstError = validationResult.error.errors[0];
          toast.error(firstError.message);
          setLoading(false);
          return;
        }

        const validData = validationResult.data;

        const { data, error } = await supabase.auth.signUp({ 
          email: validData.email, 
          password: validData.password,
          options: {
            data: {
              full_name: validData.name,
              role: "instructor"
            }
          }
        });
        if (error) throw error;

        if (data.user) {
          // Check if email confirmation is required
          if (data.user.identities && data.user.identities.length === 0) {
            toast.error("This email is already registered. Please sign in instead.");
            setIsSignUp(false);
          } else if (data.session) {
            // User is auto-confirmed, redirect to dashboard
            toast.success("Account created successfully!");
            navigate("/instructor/dashboard");
          } else {
            // Email confirmation required
            toast.success("Account created! Please check your email to confirm your account before signing in.");
            setIsSignUp(false);
          }
        }
      } else {
        // Validate sign-in inputs
        const validationResult = signInSchema.safeParse({
          email: email.trim(),
          password
        });

        if (!validationResult.success) {
          const firstError = validationResult.error.errors[0];
          toast.error(firstError.message);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({ 
          email: validationResult.data.email, 
          password: validationResult.data.password 
        });
        if (error) throw error;

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleData, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "instructor")
            .maybeSingle();
          
          if (roleError) {
            toast.error("Error checking instructor status");
            await supabase.auth.signOut();
            return;
          }

          if (roleData) {
            navigate("/instructor/dashboard");
          } else {
            toast.error("This account is not registered as an instructor");
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/5 to-secondary/10 p-4">
      <Card className="w-full max-w-md border-2 border-secondary-glow shadow-glow">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-secondary">
            Instructor Portal
          </CardTitle>
          <CardDescription>
            {isSignUp ? "Create your instructor account" : "Sign in to manage your students"}
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
            className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold shadow-glow"
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
            <Link to="/" className="text-secondary hover:underline">
              ← Back to Home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
