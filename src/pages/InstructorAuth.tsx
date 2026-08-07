// CRITICAL PATH #1 — Authentication. See CRITICAL_PATHS.md.
// Mirror any guard/ref changes in Auth.tsx and AdminAuth.tsx.
// Before editing: read CRITICAL_PATHS.md §1. After editing: run `bun run test:auth`.
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { instructorAdminSignUpSchema, signInSchema } from "@/lib/validation";
import { setOAuthRoleIntent, readOAuthRoleIntent, clearOAuthRoleIntent } from "@/lib/oauthRoleIntent";

export default function InstructorAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [conversionUserId, setConversionUserId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const isRecoveryModeRef = useRef(false);
  const isSigningUpRef = useRef(false);
  const hasResolvedRef = useRef(false);
  const navigate = useNavigate();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  const handlePasswordUpdate = async () => {
    setLoading(true);
    try {
      if (!newPassword || newPassword.length < 8) {
        toast.error("Password must be at least 8 characters");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;

      toast.success("Password updated successfully! Please sign in.");
      isRecoveryModeRef.current = false;
      setIsRecoveryMode(false);
      setNewPassword("");
      await supabase.auth.signOut();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Check for recovery token in URL on mount
  useEffect(() => {
    // Check if this is a password recovery redirect (has type=recovery in hash)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      isRecoveryModeRef.current = true;
      setIsRecoveryMode(true);
      toast.info("Please enter your new password");
    }
  }, []);

  // Handles a signed-in user who lacks the instructor role.
  // 1) If they just came back from the instructor portal's Google button, grant the role.
  // 2) If they look like a mis-roled OAuth signup (no student activity), offer conversion.
  // 3) Otherwise they are a genuine student — keep them signed in and send them to /dashboard.
  const handleMissingInstructorRole = async (userId: string, userCreatedAt: string) => {
    const intent = readOAuthRoleIntent();
    const isRecentSignup = Date.now() - new Date(userCreatedAt).getTime() < 15 * 60 * 1000;

    if (intent === 'instructor' && isRecentSignup) {
      clearOAuthRoleIntent();
      const { data: success } = await supabase.rpc('assign_oauth_role', {
        p_user_id: userId,
        p_role: 'instructor',
      });

      if (success) {
        toast.success("Instructor account created!");
        navigate("/instructor/onboarding");
        return;
      }
    }
    clearOAuthRoleIntent();

    // Does this account have any real student activity?
    const { count } = await supabase
      .from("instructor_students")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId);

    if ((count ?? 0) > 0) {
      toast.error("This account is registered as a student. Taking you to your student dashboard.");
      navigate("/dashboard");
      return;
    }

    // No student activity — most likely a Google signup that was mis-labelled.
    setConversionUserId(userId);
  };

  const convertToInstructor = async () => {
    if (!conversionUserId) return;
    setConverting(true);
    try {
      const { data: success, error } = await supabase.rpc('assign_oauth_role', {
        p_user_id: conversionUserId,
        p_role: 'instructor',
      });
      if (error) throw error;
      if (!success) throw new Error("Could not convert this account.");
      toast.success("Instructor access enabled!");
      setConversionUserId(null);
      navigate("/instructor/onboarding");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not convert this account.");
    } finally {
      setConverting(false);
    }
  };

  const declineConversion = async () => {
    setConversionUserId(null);
    navigate("/dashboard");
  };



  // Combined auth state change handler
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Handle password recovery event
      if (event === 'PASSWORD_RECOVERY') {
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        toast.info("Please enter your new password");
        return; // Don't proceed with session checks
      }

      // Skip session checks if we're in recovery mode or actively signing up
      if (isRecoveryModeRef.current || isSigningUpRef.current) {
        return;
      }

      // Handle signed in event - check role and redirect (only once per mount)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        if (hasResolvedRef.current) return;
        hasResolvedRef.current = true;
        setTimeout(async () => {
          if (isRecoveryModeRef.current || isSigningUpRef.current) return;
          // Check if user has instructor role
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "instructor")
            .maybeSingle();
          
            if (roleData) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('org_id, onboarded')
                .eq('id', session.user.id)
                .maybeSingle();
              
              if (profile?.onboarded === true) {
                navigate("/instructor/dashboard");
              } else if (!profile?.org_id) {
                navigate("/instructor/onboarding");
              } else {
                navigate("/instructor/onboarding");
              }
          } else {
            await handleMissingInstructorRole(session.user.id, session.user.created_at);
          }

        }, 0);
      }
    });

    // Check for existing session on mount (but not during recovery)
    if (!isRecoveryModeRef.current) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session || isRecoveryModeRef.current || isSigningUpRef.current) return;
        // Respect the same single-resolve guard as the listener path.
        if (hasResolvedRef.current) return;
        hasResolvedRef.current = true;
        // Trigger the same logic as SIGNED_IN
        setTimeout(async () => {
          if (isRecoveryModeRef.current || isSigningUpRef.current) return;
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "instructor")
            .maybeSingle();

          if (roleData) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('org_id, onboarded')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profile?.onboarded === true) {
              navigate("/instructor/dashboard");
            } else if (!profile?.org_id) {
              navigate("/instructor/onboarding");
            } else {
              navigate("/instructor/onboarding");
            }
          } else if (readOAuthRoleIntent() === 'instructor') {
            // Returning from the instructor portal's Google button without the role yet.
            await handleMissingInstructorRole(session.user.id, session.user.created_at);
          }

        }, 0);
      });
    }

    return () => subscription.unsubscribe();
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

        setIsSigningUp(true);
        isSigningUpRef.current = true;
        const { data, error } = await supabase.auth.signUp({ 
          email: validData.email, 
          password: validData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/instructor/auth`,
            data: {
              full_name: validData.name,
              role: "instructor"
            }
          }
        });
        if (error) {
          // Newer Supabase returns an explicit error for duplicate emails
          const msg = error.message.toLowerCase();
          if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
            toast.error("This email is already registered. Please sign in instead.");
            setIsSignUp(false);
            return;
          }
          throw error;
        }

        if (data.user) {
          // Legacy fallback: obfuscated duplicate (older Supabase returns empty identities)
          if (data.user.identities && data.user.identities.length === 0) {
            toast.error("This email is already registered. Please sign in instead.");
            setIsSignUp(false);
          } else if (data.session) {
            // handle_new_user trigger already created the instructor profile + role
            // (role was passed in user_metadata above). Just navigate.
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

        // Guard against the SIGNED_IN listener racing with handleAuth navigation
        isSigningUpRef.current = true;
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
            const { data: profile } = await supabase  
              .from('profiles')  
              .select('org_id, onboarded')  
              .eq('id', user.id)  
              .maybeSingle();  
            
            if (profile?.onboarded === true) {
              navigate("/instructor/dashboard");
            } else if (!profile?.org_id) {
              navigate("/instructor/onboarding");
            } else {
              navigate("/instructor/onboarding");
            }
          } else {
            // Signed in to the instructor portal without the instructor role.
            await handleMissingInstructorRole(user.id, user.created_at);
          }

        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setLoading(false);
      setIsSigningUp(false);
      isSigningUpRef.current = false;
    }
  };

  if (conversionUserId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12 mastery-bg">
        <div className="command-card px-7 py-9 sm:px-9 sm:py-10 w-full max-w-[400px] space-y-5">
          <div className="space-y-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Set up instructor access?
            </h1>
            <p className="text-[13px] text-muted-foreground/70">
              This account doesn't have instructor access yet, and it has no student activity.
              You can convert it into an instructor account now.
            </p>
          </div>
          <Button
            onClick={convertToInstructor}
            disabled={converting}
            className="w-full h-[44px] rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm"
          >
            {converting ? "Setting up..." : "Convert to instructor account"}
          </Button>
          <button
            onClick={declineConversion}
            className="w-full text-center text-[13px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            No thanks, continue as a student
          </button>
        </div>
      </div>
    );
  }

  return (

    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-5 py-12 mastery-bg">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full opacity-[0.04] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(160, 50%, 45%), transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] rounded-full opacity-[0.03] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(160, 45%, 55%), transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Card */}
        <div className="command-card px-7 py-9 sm:px-9 sm:py-10">
          {/* Header */}
          <div className="text-center space-y-1.5 mb-7">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Instructor Portal
            </h1>
            <p className="text-[13px] text-muted-foreground/70">
              {isRecoveryMode ? "Enter your new password" : isResetMode ? "Reset your password" : isSignUp ? "Create your instructor account" : "Sign in to manage your students"}
            </p>
          </div>

          {/* Form */}
          {isRecoveryMode ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handlePasswordUpdate()}
                  className="h-[42px] rounded-[10px] border-border/60 bg-background placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                />
              </div>
              <Button
                onClick={handlePasswordUpdate}
                disabled={loading}
                className="w-full h-[44px] rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-[0_1px_3px_0_hsl(160_84%_29%/0.25)] transition-all"
              >
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Prominent Sign In / Sign Up tab toggle */}
              {!isResetMode && (
                <div role="tablist" aria-label="Authentication mode" className="grid grid-cols-2 gap-1 p-1 bg-muted/50 border border-border/50 rounded-[10px]">
                  <button
                    role="tab"
                    aria-selected={!isSignUp}
                    onClick={() => setIsSignUp(false)}
                    className={`h-9 rounded-[7px] text-[13px] font-semibold transition-all ${
                      !isSignUp
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    role="tab"
                    aria-selected={isSignUp}
                    onClick={() => setIsSignUp(true)}
                    className={`h-9 rounded-[7px] text-[13px] font-semibold transition-all ${
                      isSignUp
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Create account
                  </button>
                </div>
              )}

              {/* Fields */}
              <div className="space-y-3.5">
                {!isResetMode && isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="instructor-name" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Full Name</Label>
                    <Input
                      id="instructor-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="h-[42px] rounded-[10px] border-border/60 bg-background placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="instructor-email" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Email</Label>
                  <Input
                    id="instructor-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={isResetMode ? (e) => e.key === 'Enter' && handlePasswordReset() : handleKeyPress}
                    className="h-[42px] rounded-[10px] border-border/60 bg-background placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                  />
                </div>
                {!isResetMode && (
                  <div className="space-y-2">
                    <Label htmlFor="instructor-password" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Password</Label>
                    <Input
                      id="instructor-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="h-[42px] rounded-[10px] border-border/60 bg-background placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Primary CTA */}
              <Button
                onClick={isResetMode ? handlePasswordReset : handleAuth}
                disabled={loading}
                className="w-full h-[44px] rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-[0_1px_3px_0_hsl(160_84%_29%/0.25)] transition-all"
              >
                {loading ? "Loading..." : isResetMode ? "Send Reset Link" : isSignUp ? "Sign Up" : "Sign In"}
              </Button>

              {!isResetMode && !isSignUp && (
                <button
                  onClick={() => setIsResetMode(true)}
                  className="w-full text-center text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Forgot password?
                </button>
              )}

              {!isResetMode && (
                <>
                  <div className="relative my-1.5">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/40" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-3 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      // Persist intent: Supabase can't carry a role through the OAuth round-trip.
                      setOAuthRoleIntent('instructor');
                      const { error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                          redirectTo: `${window.location.origin}/instructor/auth`,
                        }
                      });

                      if (error) {
                        toast.error(error.message);
                      }
                    }}
                    variant="outline"
                    className="w-full h-[42px] rounded-[10px] border-border/50 bg-background hover:bg-muted/40 hover:border-border/70 text-foreground text-sm font-medium flex items-center justify-center gap-2.5 transition-all"
                  >
                    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>

                </>
              )}

              {isResetMode && (
                <button
                  onClick={() => setIsResetMode(false)}
                  className="w-full text-center text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors pt-1"
                >
                  ← Back to Sign In
                </button>
              )}
            </div>
          )}
        </div>

        {/* Back link — outside card */}
        {!isRecoveryMode && (
          <p className="text-center mt-8">
            <Link to="/" className="text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              ← Back to Home
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
