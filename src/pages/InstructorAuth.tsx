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
  const [isResetMode, setIsResetMode] = useState(false);
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
        // Check if user has instructor role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "instructor")
          .maybeSingle();
        
        if (roleData) {
          // Check if user has completed onboarding
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarded, course_title, course_schedule, course_topics')
            .eq('id', session.user.id)
            .single();
          
          if (!profile?.onboarded || !profile?.course_title || !profile?.course_schedule || !profile?.course_topics || profile.course_topics.length === 0) {
            navigate("/instructor/onboarding");
          } else {
            navigate("/instructor/dashboard");
          }
        } else {
          // Check if this is a new OAuth signup (only has student role)
          const { data: studentRole } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "student")
            .maybeSingle();
          
          if (studentRole) {
            // New OAuth signup - assign instructor role and send to onboarding
            const { data: success } = await supabase
              .rpc('assign_oauth_role', { 
                p_user_id: session.user.id, 
                p_role: 'instructor' 
              });
            
            if (success) {
              toast.success("Instructor account created!");
              navigate("/instructor/onboarding");
            }
          }
        }
      }
    };
    checkSession();
  }, [navigate]);

  const handlePasswordReset = async () => {
    setLoading(true);
    try {
      if (!email.trim()) {
        toast.error("Please enter your email address");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/instructor/auth`,
      });

      if (error) throw error;

      toast.success("Password reset link sent! Check your email.");
      setIsResetMode(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

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
            // User is auto-confirmed, redirect to onboarding
            toast.success("Account created successfully!");
            navigate("/instructor/onboarding");
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
            // Check if user has completed onboarding
            const { data: profile } = await supabase
              .from('profiles')
              .select('onboarded, course_title, course_schedule, course_topics')
              .eq('id', user.id)
              .single();
            
            if (!profile?.onboarded || !profile?.course_title || !profile?.course_schedule || !profile?.course_topics || profile.course_topics.length === 0) {
              navigate("/instructor/onboarding");
            } else {
              navigate("/instructor/dashboard");
            }
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
            {isResetMode ? "Reset your password" : isSignUp ? "Create your instructor account" : "Sign in to manage your students"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isResetMode && isSignUp && (
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
            onKeyPress={isResetMode ? (e) => e.key === 'Enter' && handlePasswordReset() : handleKeyPress}
            className="retro-input"
          />
          {!isResetMode && (
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="retro-input"
            />
          )}
          <Button
            onClick={isResetMode ? handlePasswordReset : handleAuth}
            disabled={loading}
            className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold shadow-glow"
          >
            {loading ? "Loading..." : isResetMode ? "Send Reset Link" : isSignUp ? "Sign Up" : "Sign In"}
          </Button>

          {!isResetMode && !isSignUp && (
            <Button
              variant="ghost"
              onClick={() => setIsResetMode(true)}
              className="w-full text-sm"
            >
              Forgot password?
            </Button>
          )}

          {!isResetMode && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-input" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/instructor/auth`,
                      queryParams: {
                        role: 'instructor'
                      }
                    }
                  });
                  if (error) {
                    toast.error(error.message);
                  }
                }}
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <Button
                variant="ghost"
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full"
              >
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </Button>
            </>
          )}

          {isResetMode && (
            <Button
              variant="ghost"
              onClick={() => setIsResetMode(false)}
              className="w-full"
            >
              ← Back to Sign In
            </Button>
          )}
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
