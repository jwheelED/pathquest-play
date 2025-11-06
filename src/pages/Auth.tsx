"use client";

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { studentSignUpSchema, signInSchema } from "@/lib/validation";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [instructorCode, setInstructorCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [session, setSession] = useState(null);

  const navigate = useNavigate();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  const handleAuth = async () => {
    setError("");
    setSuccess("");

    if (isSignUp) {
      // Validate student signup inputs
      const validationResult = studentSignUpSchema.safeParse({
        email: email.trim(),
        password,
        name: name.trim(),
        instructorCode: instructorCode.trim().toUpperCase() || undefined
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        setError(firstError.message);
        toast.error(firstError.message);
        return;
      }

      const validData = validationResult.data;

      const { data, error } = await supabase.auth.signUp({
        email: validData.email,
        password: validData.password,
      });

      if (error) {
        // Check if user already exists
        if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('user already exists')) {
          setError('This email is already registered. Please sign in instead.');
          toast.error('This email is already registered. Please sign in instead.');
        } else {
          setError(error.message);
          toast.error(error.message);
        }
        return;
      }

      const user = data.user;
      if (user) {
        // Create user profile
        const { error: insertError } = await supabase.from("users").insert({
          id: user.id,
          user_id: user.id,
          name: validData.name,
          email: validData.email,
        });

        // Create user stats for gamification
        const { error: statsError } = await supabase.from("user_stats").insert({
          user_id: user.id,
        });

        if (insertError) {
          toast.error("Error creating user profile");
        }
        if (statsError) {
          toast.error("Error creating user stats");
        }

        // Link to instructor if code provided
        if (validData.instructorCode) {
          // Use validate_instructor_code RPC function
          const { data: instructorId, error: validateError } = await supabase
            .rpc("validate_instructor_code", { code: validData.instructorCode });

          if (instructorId) {
            const { error: linkError } = await supabase
              .from("instructor_students")
              .insert({
                instructor_id: instructorId,
                student_id: user.id,
              });

            if (linkError) {
              toast.error("Valid code, but failed to link to instructor");
            } else {
              toast.success("Successfully linked to instructor!");
            }
          } else {
            toast.error("Invalid instructor code");
          }
        }
        
        setSuccess("Account created! Please check your email to confirm your account.");
        toast.success("Account created! Check your email to confirm before signing in.");
        // Don't navigate yet - let them confirm email first
        setIsSignUp(false); // Switch to sign-in mode
      }
    } else {
      // Validate sign-in inputs
      const validationResult = signInSchema.safeParse({
        email: email.trim(),
        password
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        setError(firstError.message);
        toast.error(firstError.message);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ 
        email: validationResult.data.email, 
        password: validationResult.data.password 
      });

      if (error) {
        // Check for email not confirmed error
        if (error.message.toLowerCase().includes('email not confirmed') || 
            error.message.toLowerCase().includes('verify your email')) {
          setError('Please confirm your email before signing in. Check your inbox for the confirmation link.');
          toast.error('Please confirm your email before signing in. Check your inbox for the confirmation link.');
        } else if (error.message.toLowerCase().includes('invalid login credentials')) {
          // Could be wrong password OR unconfirmed email
          setError('Invalid email or password. If you just signed up, please confirm your email first.');
          toast.error('Invalid email or password. If you just signed up, please confirm your email first.');
        } else {
          setError(error.message);
          toast.error(error.message);
        }
      } else {
        setSuccess("Signed in successfully!");
        // Check if user has completed onboarding
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", user.id)
            .single();
          
          if (profile?.onboarded) {
            navigate("/dashboard");
          } else {
            navigate("/onboarding");
          }
        }
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const fetchSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      setSession(data.session);
    }
  };

  useEffect(() => {
    fetchSession();

    const {data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      
      setSession(session);

      if (session) {
        const checkOnboarding = async () => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile?.onboarded) {
            navigate("/dashboard");
          } else {
            // For new OAuth signups, create user stats
            if (session.user.app_metadata.provider === 'google') {
              await supabase.from("user_stats").insert({
                user_id: session.user.id,
              }).then(() => {
                // Errors are OK here - record might already exist
              });
            }
            navigate("/onboarding");
          }
        };

        checkOnboarding();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-primary/10 px-4">
      <div className="w-full max-w-md p-8 bg-card shadow-glow border border-primary-glow rounded-xl">
        {session ? (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center text-foreground">You are signed in</h2>
            <p className="text-center text-sm mb-4 text-muted-foreground">{session.user.email}</p>
            <button
              onClick={handleLogout}
              className="w-full bg-destructive text-destructive-foreground p-2 rounded-lg hover:bg-destructive/90 transition"
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center text-primary">
              {isSignUp ? "Create an account" : "Sign in to your account"}
            </h2>

            {error && <p className="text-destructive mb-4 text-sm">{error}</p>}
            {success && <p className="text-primary mb-4 text-sm">{success}</p>}

            {isSignUp && (
              <>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  placeholder="Instructor Code (Optional)"
                  value={instructorCode}
                  onChange={(e) => setInstructorCode(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full mb-6 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <button
              onClick={handleAuth}
              className="w-full bg-primary text-primary-foreground p-2 rounded-lg hover:bg-primary/90 transition font-semibold shadow-glow"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-input" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <button
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/auth`,
                  }
                });
                if (error) {
                  toast.error(error.message);
                }
              }}
              className="w-full flex items-center justify-center gap-2 bg-background border-2 border-input text-foreground p-2 rounded-lg hover:bg-accent/10 transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <p className="mt-4 text-sm text-center text-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline font-semibold"
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
            <p className="mt-4 text-sm text-center text-muted-foreground">
              <Link to="/" className="text-primary hover:underline">
                ← Back to Home
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}